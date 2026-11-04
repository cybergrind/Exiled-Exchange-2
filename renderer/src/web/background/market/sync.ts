// The app's side of the price snapshot (guide/poe-source.html, D4, WP-23 and
// WP-24): read it at start, write it and the hourly history after each
// refresh, all through main's /market/ route (marketFiles.ts). HTTP is
// injected. Erasable TypeScript only; see types.ts.
import { aggregatePairs } from "./cx.ts";
import type { CxHourEntry } from "./cx.ts";
import { leagueSlug, parseSnapshot, serializeSnapshot } from "./snapshot.ts";
import type { Snapshot } from "./snapshot.ts";
import { HISTORY_CONTENT_TYPE, SNAPSHOT_CONTENT_TYPE } from "./marketFiles.ts";
import { historyPoint, parseHistory, serializePoint } from "./history.ts";
import type { HistoryPoint } from "./history.ts";

/** Refresh period while the price check is in use. §7 SYNC_MINUTES. */
export const SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** The part of fetch() used here; window.fetch fits. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    cache?: RequestCache;
  },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export function snapshotUrl(league: string): string {
  return `/market/${leagueSlug(league)}.json`;
}

export function historyUrl(league: string): string {
  return `/market/${leagueSlug(league)}.history`;
}

/**
 * Start-up rule (D4): the selected league's own snapshot, however old. The
 * price panel dims a price past STALE_HOURS and names its age; the refresh
 * still runs on its usual schedule.
 */
export function isUsableBootSnapshot(
  snapshot: Snapshot | undefined,
  league: string,
): snapshot is Snapshot {
  return snapshot !== undefined && snapshot.league === league;
}

/**
 * The relay overview in the text form Prices.ts parses (splitJsonBlob,
 * parseXchg, findPriceByQuery): compact JSON in the relay's key order, which
 * JSON.parse and JSON.stringify keep.
 */
export function overviewText(overview: unknown): string {
  return JSON.stringify(overview);
}

/** Undefined when there is none, it is unreadable, or main is unreachable. */
export async function readSnapshotFile(
  fetchFn: FetchLike,
  league: string,
): Promise<Snapshot | undefined> {
  try {
    const res = await fetchFn(snapshotUrl(league), { cache: "no-store" });
    if (res.status !== 200) return undefined;
    return parseSnapshot(await res.text());
  } catch {
    return undefined;
  }
}

/** The league's recorded history, oldest first; empty when there is none. */
export async function readHistoryPoints(
  fetchFn: FetchLike,
  league: string,
): Promise<HistoryPoint[]> {
  try {
    const res = await fetchFn(historyUrl(league), { cache: "no-store" });
    if (res.status !== 200) return [];
    return parseHistory(await res.text()).points;
  } catch {
    return [];
  }
}

async function check(
  res: Awaited<ReturnType<FetchLike>>,
  what: string,
): Promise<void> {
  if (res.ok) return;
  const reason = await res.text().catch(() => "");
  throw new Error(`${what}: HTTP ${res.status} ${reason}`.trim());
}

export async function writeSnapshotFile(
  fetchFn: FetchLike,
  snapshot: Snapshot,
): Promise<void> {
  const res = await fetchFn(snapshotUrl(snapshot.league), {
    method: "PUT",
    headers: { "content-type": SNAPSHOT_CONTENT_TYPE },
    body: serializeSnapshot(snapshot),
  });
  await check(res, `Writing the ${snapshot.league} snapshot`);
}

export async function appendHistoryFile(
  fetchFn: FetchLike,
  league: string,
  lines: string[],
): Promise<void> {
  if (!lines.length) return;
  const res = await fetchFn(historyUrl(league), {
    method: "POST",
    headers: { "content-type": HISTORY_CONTENT_TYPE },
    body: `${lines.join("\n")}\n`,
  });
  await check(res, `Appending ${league} history`);
}

/**
 * One NDJSON line per hour of `league` with all its pairs (history.ts), from
 * single-hour digests. An hour with no market of the league writes nothing.
 */
export function historyLines(hours: CxHourEntry[], league: string): string[] {
  return [...hours]
    .sort((a, b) => a.hour - b.hour)
    .map((entry) => historyPoint(entry.hour, aggregatePairs([entry], league)))
    .filter((point) => Object.keys(point.pairs).length > 0)
    .map(serializePoint);
}
