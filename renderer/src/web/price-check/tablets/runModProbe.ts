// Runs a "Value the mods" plan (modProbe.ts) against the trade site, one
// search and one fetch per probe, in order. It waits for the app's own rate
// limiter before each request instead of tripping its "Retry after" guard;
// any error from the site stops the run, with no retry (guide/tablets.html T-6).
import type { ParsedItem } from "@/parser";
import { AppConfig } from "@/web/Config";
import type { ItemFilters } from "../filters/interfaces";
import {
  createTradeRequest,
  requestResults,
  requestTradeResultList,
} from "../trade/pathofexile-trade";
import { RATE_LIMIT_RULES } from "../trade/common";
import { RateLimiter } from "../trade/RateLimiter";
import { divineValueOfListing } from "../trade/trade-api";
import { listingFloor } from "../trade/listingFloor";
import { probeTrade, type ModProbe } from "./modProbe";

/** The cheapest listings a probe floor is read from. */
const PROBE_FETCH = 10;

export interface ProbeOutcome {
  /** In divines; undefined below 3 priced listings. */
  floor?: number;
  total: number;
}

async function waitForLimiter(): Promise<void> {
  const ms = Math.max(
    RateLimiter.estimateTime(1, RATE_LIMIT_RULES.SEARCH),
    RateLimiter.estimateTime(1, RATE_LIMIT_RULES.FETCH),
  );
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms + 250));
}

export async function runModProbe(
  plan: readonly ModProbe[],
  filters: ItemFilters,
  item: ParsedItem,
  onStep: (index: number) => void,
  cancelled: () => boolean,
): Promise<ProbeOutcome[]> {
  const out: ProbeOutcome[] = [];
  const probeFilters: ItemFilters = {
    ...filters,
    trade: probeTrade(filters.trade),
  };
  for (let i = 0; i < plan.length; i++) {
    if (cancelled()) break;
    onStep(i);
    await waitForLimiter();
    if (cancelled()) break;
    const search = await requestTradeResultList(
      createTradeRequest(probeFilters, plan[i].stats, item),
      filters.trade.league,
    );
    let floor: number | undefined;
    if (search.result.length) {
      await waitForLimiter();
      const results = await requestResults(
        search.id,
        search.result.slice(0, PROBE_FETCH),
        { accountName: AppConfig().accountName },
      );
      floor = listingFloor(results.map(divineValueOfListing));
    }
    out.push({ floor, total: search.total });
  }
  return out;
}
