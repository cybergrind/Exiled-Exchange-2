// App state for GGG Currency Exchange prices (guide/poe-source.html, WP-16).
// The market/ modules are pure and Node-runnable; this is the Vue side.
import { shallowRef } from "vue";
import { createGlobalState } from "@vueuse/core";
import { Host } from "./IPC";
import { fetchCxWindow } from "./market/client.ts";
import type { CxWindowHour, FetchText } from "./market/client.ts";
import { aggregatePairs } from "./market/cx.ts";
import { CX_FEED_URL } from "./market/constants.ts";
import { exchangeValue } from "./market/exchangeValue.ts";
import type { CoreCurrency, ExchangeValue } from "./market/exchangeValue.ts";
import type { SnapshotCx } from "./market/snapshot.ts";
import type { CxHour, ItemPairs, PairTable } from "./market/types.ts";

interface CxIdFile {
  ids: Record<string, { name: string; ns: string }>;
}

export interface MarketLoadResult {
  league: string;
  /** Hours fetched by this load, with their digests: new history. */
  fetched: CxWindowHour[];
}

const fetchText: FetchText = async (url) => {
  const response = await Host.proxy(url);
  return { status: response.status, body: await response.text() };
};

export const useMarket = createGlobalState(() => {
  const table = shallowRef<PairTable>({});
  const league = shallowRef<string | undefined>(undefined);
  const asOfHour = shallowRef<number | undefined>(undefined);
  /** The unix hours behind `table`, ascending. */
  const hours = shallowRef<number[]>([]);
  const errors = shallowRef<string[]>([]);

  // Digests cover every league, so one cache serves a league switch too.
  const hourCache = new Map<number, CxHour>();
  let idsByName: Map<string, string[]> | undefined;
  // Loads run one after another; a failed one does not block the next.
  let queue: Promise<void> = Promise.resolve();

  async function loadIds() {
    if (idsByName) return;
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/poe-source/cx-ids.json`,
    );
    const file = (await response.json()) as CxIdFile;
    idsByName = new Map();
    for (const [id, { name, ns }] of Object.entries(file.ids)) {
      const key = `${ns}::${name}`;
      idsByName.set(key, [...(idsByName.get(key) ?? []), id]);
    }
  }

  function switchTo(leagueId: string) {
    if (league.value === leagueId) return;
    league.value = leagueId;
    table.value = {};
    asOfHour.value = undefined;
    hours.value = [];
  }

  async function doLoad(
    leagueId: string,
    nowMs: number,
  ): Promise<MarketLoadResult> {
    switchTo(leagueId);
    await loadIds();

    const result = await fetchCxWindow({
      fetchText,
      baseUrl: CX_FEED_URL,
      nowMs,
      cache: hourCache,
    });
    errors.value = result.errors.map((e) =>
      `${e.hour}: ${e.status ?? ""} ${e.message}`.trim(),
    );

    const fresh = result.fetched.length > 0;
    for (const { hour, digest } of result.hours) hourCache.set(hour, digest);
    if (fresh) {
      const keep = new Set(result.hours.map((h) => h.hour));
      for (const hour of [...hourCache.keys()]) {
        if (!keep.has(hour)) hourCache.delete(hour);
      }
    }

    // A failed refresh keeps what is shown rather than shrinking the window.
    const empty = Object.keys(table.value).length === 0;
    if (result.hours.length && (fresh || empty) && league.value === leagueId) {
      table.value = aggregatePairs(result.hours, leagueId);
      asOfHour.value = result.hours[result.hours.length - 1].hour;
      hours.value = result.hours.map((h) => h.hour);
    }

    const fetched = new Set(result.fetched);
    return {
      league: leagueId,
      fetched: result.hours.filter((h) => fetched.has(h.hour)),
    };
  }

  /** Fetches new hours (at most once at a time) and re-aggregates. */
  function load(
    leagueId: string,
    nowMs = Date.now(),
  ): Promise<MarketLoadResult> {
    const run = queue.then(() => doLoad(leagueId, nowMs));
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Shows a saved table (the snapshot read at start) until the feed answers.
   * Never replaces a newer table of the same league. Queued behind loads.
   */
  function restore(leagueId: string, cx: SnapshotCx): Promise<boolean> {
    const run = queue.then(() => {
      if (league.value === leagueId && (asOfHour.value ?? 0) >= cx.asOfHour) {
        return false;
      }
      switchTo(leagueId);
      table.value = cx.pairs;
      asOfHour.value = cx.asOfHour;
      hours.value = cx.hours;
      return true;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** What a snapshot of `leagueId` holds for the feed, or null if nothing. */
  function snapshotCx(leagueId: string): SnapshotCx | null {
    if (league.value !== leagueId || asOfHour.value === undefined) return null;
    return {
      asOfHour: asOfHour.value,
      hours: hours.value,
      pairs: table.value,
    };
  }

  function pairsFor(ns: string, name: string): ItemPairs | undefined {
    // Read the ref first: the id map is not reactive, and a computed that
    // ran before it loaded must still rerun when the table arrives.
    const current = table.value;
    for (const id of idsByName?.get(`${ns}::${name}`) ?? []) {
      const pairs = current[id];
      if (pairs) return pairs;
    }
    return undefined;
  }

  /** The GGG id whose pairs pairsFor returns, for the item's history. */
  function pairIdFor(ns: string, name: string): string | undefined {
    const current = table.value;
    return idsByName?.get(`${ns}::${name}`)?.find((id) => current[id]);
  }

  function valueFor(
    ns: string,
    name: string,
    core: CoreCurrency,
    ninja?: { primaryValue: number },
  ): ExchangeValue | null {
    return exchangeValue({
      pairs: pairsFor(ns, name),
      core,
      table: table.value,
      ninja,
    });
  }

  return {
    table,
    league,
    asOfHour,
    errors,
    load,
    restore,
    snapshotCx,
    pairsFor,
    pairIdFor,
    valueFor,
  };
});
