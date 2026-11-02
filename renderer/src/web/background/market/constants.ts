import type { QuoteCurrency } from "./types.ts";

/** GGG metadata ids of the quote currencies. */
export const QUOTE_IDS: Record<QuoteCurrency, string> = {
  exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
  chaos: "Metadata/Items/Currency/CurrencyRerollRare",
  divine: "Metadata/Items/Currency/CurrencyModValues",
};

/** Hours aggregated into one PairStat. Judgment; see guide/poe-source.html §7. */
export const WINDOW_HOURS = 6;

/** Below this many item units traded in the window, a pair is thin. */
export const MIN_TRADED = 10;

/**
 * Below this many units, the core pair is too thin to be the headline when
 * another pair traded more: a few trades can sit far from the market.
 */
export const THIN_TRADED = 50;

export const CX_FEED_URL = "web.poecdn.com/api/currency-exchange/poe2";
