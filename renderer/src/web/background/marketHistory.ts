// The league's recorded price history, for the chart (guide/poe-source.html,
// WP-31). Read from the local /market route; kept for MAX_AGE_MS so opening
// several price checks in a row reads the file once.
import { shallowRef } from "vue";
import { createGlobalState } from "@vueuse/core";
import { readHistoryPoints } from "./market/sync.ts";
import type { FetchLike } from "./market/sync.ts";
import type { HistoryPoint } from "./market/history.ts";

const MAX_AGE_MS = 10 * 60_000;

const localFetch: FetchLike = (url, init) => fetch(url, init);

export const useMarketHistory = createGlobalState(() => {
  const points = shallowRef<HistoryPoint[]>([]);
  const league = shallowRef<string | undefined>(undefined);
  let readAt = 0;
  let pending: { league: string; run: Promise<void> } | undefined;

  function ensure(leagueId: string, nowMs = Date.now()): Promise<void> {
    if (pending?.league === leagueId) return pending.run;
    if (league.value === leagueId && nowMs - readAt < MAX_AGE_MS) {
      return Promise.resolve();
    }
    const run = readHistoryPoints(localFetch, leagueId).then((read) => {
      // A read for a league switched away from does not land.
      if (pending?.run !== run) return;
      pending = undefined;
      points.value = read;
      league.value = leagueId;
      readAt = nowMs;
    });
    pending = { league: leagueId, run };
    return run;
  }

  return { points, league, ensure };
});
