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
 * With no pair at MIN_TRADED, a pair with this many units over at least
 * MIN_THIN_HOURS hours is still shown (marked thin) before poe.ninja.
 */
export const MIN_THIN_TRADED = 5;
export const MIN_THIN_HOURS = 2;

/**
 * Below this many units, the core pair is too thin to be the headline when
 * another pair traded more: a few trades can sit far from the market.
 */
export const THIN_TRADED = 50;

/** A thin core pair yields only to a pair with at least this many times its trades. */
export const BUSIER_FACTOR = 2;

/**
 * A core pair past the thin bar still yields to a clearly busier pair when
 * their rates disagree by more than this ratio either way: Omen of the
 * Blessed traded 154 at 76 ex while 1.5K went at 1/3.4 div (about 209 ex).
 */
export const DISAGREE_RATIO = 1.3;

/**
 * ...but only a pair whose rate is at least this many quote units per item:
 * cheap items bought with whole divines or chaos fill at skewed rates (one
 * divine went for anything from 118 to 300 Orbs of Alchemy in an hour).
 */
export const OVERRIDE_MIN_RATE = { exalted: 0, chaos: 1, divine: 0.1 } as const;

/**
 * Prices older than this are still shown at once (a snapshot of any age is
 * read at start), but dimmed with their age. Judgment; see guide/poe-source.html §7.
 */
export const STALE_HOURS = 6;

export const CX_FEED_URL = "web.poecdn.com/api/currency-exchange/poe2";
