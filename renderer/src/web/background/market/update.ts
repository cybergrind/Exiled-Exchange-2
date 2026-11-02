// One snapshot update for one league (guide/poe-source.html, D4 and WP-20):
// GGG feed + relay overview -> <slug>.json. File access and HTTP are
// injected, so the CLI (Node fs + fetch) and tests share this code.
// Erasable TypeScript only; see types.ts.
import { fetchCxWindow } from "./client.ts";
import type { CxWindowHour, FetchText } from "./client.ts";
import { historyPoint, mergeHistory, serializePoint } from "./history.ts";
import { CX_FEED_URL } from "./constants.ts";
import { aggregatePairs } from "./cx.ts";
import { isOlderLeague, pickDefaultLeague } from "./leagues.ts";
import {
  isSnapshotStale,
  leagueSlug,
  parseSnapshot,
  serializeSnapshot,
  snapshotFileName,
  SNAPSHOT_VERSION,
} from "./snapshot.ts";
import type {
  Snapshot,
  SnapshotCx,
  SnapshotRelay,
  SnapshotUniques,
} from "./snapshot.ts";
import {
  mergeUniqueLines,
  STASH_TYPES,
  uniqueOverviewUrl,
} from "./uniques.ts";
import type { StashType } from "./uniques.ts";
import type { CxHour } from "./types.ts";

export const RELAY_URL = "https://api.exiledexchange2.dev/proxy";
export const LEAGUES_URL =
  "https://www.pathofexile.com/api/trade2/data/leagues";
const CX_HOURS_DIR = "cx-hours";
/** poe.ninja's stash overview: at most hourly (guide/poe-source.html, §7). */
export const UNIQUES_MAX_AGE_MS = 60 * 60_000;

export interface HttpResponse {
  status: number;
  body: string;
  /** Lower-case names. */
  headers: Record<string, string>;
}

/** Resolves for any HTTP status; rejects only on network failure. */
export type HttpGet = (
  url: string,
  headers?: Record<string, string>,
) => Promise<HttpResponse>;

/** Files under the market data directory; names may contain one "/". */
export interface SnapshotStore {
  read(name: string): Promise<string | undefined>;
  /** Must be atomic: a killed write may not leave a truncated file. */
  write(name: string, text: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  remove(name: string): Promise<void>;
}

export interface UpdateOptions {
  league: string;
  nowMs: number;
  http: HttpGet;
  store: SnapshotStore;
  log: (message: string) => void;
  /** Skip everything when this league's snapshot is younger. */
  ifOlderThanMinutes?: number;
}

export interface UpdateResult {
  status: "written" | "fresh";
  snapshot: Snapshot;
  /** For the user: printed by the CLI and passed through by ./run. */
  notices: string[];
}

/** The relay's path segment, as the app builds it (Prices.ts). */
export function relayLeagueSegment(league: string): string {
  if (league === "Standard") return "standard";
  if (league === "Hardcore") return "hardcore";
  return encodeURIComponent(league);
}

async function readSnapshot(
  store: SnapshotStore,
  name: string,
  log: UpdateOptions["log"],
): Promise<Snapshot | undefined> {
  const text = await store.read(name);
  if (text === undefined) return undefined;
  try {
    return parseSnapshot(text);
  } catch (err) {
    log(`Ignoring ${name}: ${(err as Error).message}`);
    return undefined;
  }
}

async function leagueNotices(
  league: string,
  http: HttpGet,
  log: UpdateOptions["log"],
): Promise<string[]> {
  try {
    const res = await http(LEAGUES_URL);
    if (res.status !== 200) {
      log(`League list: HTTP ${res.status}`);
      return [];
    }
    const ids = (
      JSON.parse(res.body) as { result: { id: string }[] }
    ).result.map((l) => l.id);
    if (!isOlderLeague(league, ids)) return [];
    return [
      `${league} is not the current league; the current one is ${pickDefaultLeague(ids)}.`,
    ];
  } catch (err) {
    log(`League list: ${(err as Error).message}`);
    return [];
  }
}

async function updateCx(
  opts: UpdateOptions,
  previous: SnapshotCx | null,
): Promise<{ cx: SnapshotCx | null; ok: boolean; hours: CxWindowHour[] }> {
  const { store, http, nowMs, league, log } = opts;

  const cache = new Map<number, CxHour>();
  for (const name of await store.list(CX_HOURS_DIR)) {
    const hour = Number(name.replace(/\.json$/, ""));
    const text = await store.read(`${CX_HOURS_DIR}/${name}`);
    if (!Number.isInteger(hour) || text === undefined) continue;
    try {
      cache.set(hour, JSON.parse(text) as CxHour);
    } catch {
      await store.remove(`${CX_HOURS_DIR}/${name}`);
    }
  }

  const fetchText: FetchText = async (url) => {
    const res = await http(url);
    return { status: res.status, body: res.body };
  };
  const result = await fetchCxWindow({
    fetchText,
    baseUrl: `https://${CX_FEED_URL}`,
    nowMs,
    cache,
  });
  for (const error of result.errors) {
    log(`Currency Exchange hour ${error.hour}: ${error.message}`);
  }

  // Hours are immutable: keep each once, drop those outside the window.
  const fetched = new Set(result.fetched);
  for (const { hour, digest } of result.hours) {
    if (fetched.has(hour)) {
      await store.write(`${CX_HOURS_DIR}/${hour}.json`, JSON.stringify(digest));
    }
  }
  if (fetched.size > 0) {
    const keep = new Set(result.hours.map((h) => `${h.hour}.json`));
    for (const name of await store.list(CX_HOURS_DIR)) {
      if (!keep.has(name)) await store.remove(`${CX_HOURS_DIR}/${name}`);
    }
  }

  const ok = fetched.size > 0 || result.errors.length === 0;
  if (!ok || result.hours.length === 0) {
    return { cx: previous, ok, hours: result.hours };
  }
  return {
    ok,
    hours: result.hours,
    cx: {
      asOfHour: result.hours[result.hours.length - 1].hour,
      hours: result.hours.map((h) => h.hour),
      pairs: aggregatePairs(result.hours, league),
    },
  };
}

async function updateRelay(
  opts: UpdateOptions,
  previous: SnapshotRelay | null,
): Promise<{ relay: SnapshotRelay | null; ok: boolean }> {
  const { http, nowMs, league, log } = opts;
  const url = `${RELAY_URL}/${relayLeagueSegment(league)}/overviewData.json`;
  const headers: Record<string, string> = {};
  if (previous?.etag) headers["If-None-Match"] = previous.etag;

  let res: HttpResponse;
  try {
    res = await http(url, headers);
  } catch (err) {
    log(`Relay: ${(err as Error).message}`);
    return { relay: previous, ok: false };
  }
  const fetchedAt = new Date(nowMs).toISOString();
  if (res.status === 304 && previous) {
    return { relay: { ...previous, fetchedAt }, ok: true };
  }
  if (res.status !== 200) {
    log(`Relay: HTTP ${res.status}`);
    return { relay: previous, ok: false };
  }
  let overview: unknown;
  try {
    overview = JSON.parse(res.body);
  } catch {
    log("Relay: unparsable body");
    return { relay: previous, ok: false };
  }
  return {
    ok: true,
    relay: { fetchedAt, etag: res.headers.etag, overview },
  };
}

/**
 * Merges the window's hours into <slug>.history.ndjson (WP-30). Every hour in
 * the window, not only the ones fetched now: the hour cache is shared by all
 * leagues, so a run for another league may have fetched them. The merge keeps
 * each hour once, so the file changes only when an hour is new.
 */
async function updateHistory(
  opts: UpdateOptions,
  hours: CxWindowHour[],
): Promise<void> {
  if (!hours.length) return;
  const { store, league, nowMs } = opts;
  const name = `${leagueSlug(league)}.history.ndjson`;
  const lines = [...hours]
    .sort((a, b) => a.hour - b.hour)
    .map((entry) => historyPoint(entry.hour, aggregatePairs([entry], league)))
    .filter((point) => Object.keys(point.pairs).length > 0)
    .map(serializePoint);
  const existing = (await store.read(name)) ?? "";
  const merged = mergeHistory(existing, lines.join("\n"), nowMs);
  if (merged.text !== existing) await store.write(name, merged.text);
}

/**
 * WP-50: the unique lines, one request per type, at most hourly. A type that
 * fails keeps its last lines; when none answers the block is left as it was.
 */
export async function fetchUniqueLines(
  opts: Pick<UpdateOptions, "league" | "nowMs" | "http" | "log">,
  previous: SnapshotUniques | undefined,
): Promise<SnapshotUniques | undefined> {
  const { league, nowMs, http, log } = opts;
  if (previous && nowMs - Date.parse(previous.fetchedAt) < UNIQUES_MAX_AGE_MS) {
    return previous;
  }
  const bodies: Partial<Record<StashType, unknown>> = {};
  let answered = 0;
  for (const type of STASH_TYPES) {
    try {
      const res = await http(uniqueOverviewUrl(league, type));
      if (res.status !== 200) {
        log(`Uniques ${type}: HTTP ${res.status}`);
        continue;
      }
      bodies[type] = JSON.parse(res.body);
      answered++;
    } catch (e) {
      log(`Uniques ${type}: ${(e as Error).message}`);
    }
  }
  if (!answered) return previous;
  const lines = mergeUniqueLines(previous?.lines ?? [], bodies);
  return { fetchedAt: new Date(nowMs).toISOString(), lines };
}

/**
 * Fetches what changed and writes the snapshot. Throws, leaving the previous
 * file in place, when neither source answered.
 */
export async function updateSnapshot(
  opts: UpdateOptions,
): Promise<UpdateResult> {
  const { league, nowMs, store, log } = opts;
  const name = snapshotFileName(league);
  const previous = await readSnapshot(store, name, log);

  if (
    opts.ifOlderThanMinutes !== undefined &&
    previous &&
    !isSnapshotStale(previous, opts.ifOlderThanMinutes, nowMs, league)
  ) {
    return { status: "fresh", snapshot: previous, notices: [] };
  }

  const notices = await leagueNotices(league, opts.http, log);
  const cx = await updateCx(opts, previous?.cx ?? null);
  const relay = await updateRelay(opts, previous?.relay ?? null);
  if (!cx.ok && !relay.ok) {
    throw new Error(
      `Nothing new for ${league}: the Currency Exchange feed and the relay both failed`,
    );
  }

  const snapshot: Snapshot = {
    schemaVersion: SNAPSHOT_VERSION,
    league,
    writtenAt: new Date(nowMs).toISOString(),
    cx: cx.cx,
    relay: relay.relay,
  };
  const uniques = await fetchUniqueLines(opts, previous?.uniques);
  if (uniques) snapshot.uniques = uniques;
  await store.write(name, serializeSnapshot(snapshot));
  await updateHistory(opts, cx.hours);
  return { status: "written", snapshot, notices };
}
