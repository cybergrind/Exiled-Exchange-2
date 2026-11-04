// The one place that decides which price an exchange item shows.
// guide/poe-source.html, D2: never convert a pair rate through the divine rate
// for display; that is the defect this replaces.

import {
  BUSIER_FACTOR,
  DISAGREE_RATIO,
  MIN_THIN_HOURS,
  MIN_THIN_TRADED,
  MIN_TRADED,
  OVERRIDE_MIN_RATE,
  QUOTE_IDS,
  THIN_TRADED,
} from "./constants.ts";
import type { ItemPairs, PairTable, QuoteCurrency } from "./types.ts";

export type CoreCurrency = "exalted" | "chaos";

export interface ExchangeQuery {
  /** GGG pair stats for the item, if the feed has it. */
  pairs: ItemPairs | undefined;
  core: CoreCurrency;
  /** All pair stats, for the rates between quote currencies. */
  table: PairTable;
  /** poe.ninja's value in divines, the fallback. */
  ninja?: { primaryValue: number };
}

export interface ExchangeValue {
  /** D2 selection rule: 1 own core pair, 2 own other pair, 3 poe.ninja. */
  rule: 1 | 2 | 3;
  source: "ggg" | "ninja";
  /** Currency of `value`, `low` and `high`. */
  currency: QuoteCurrency;
  /** Display value: never converted for rules 1 and 2. */
  value: number;
  low?: number;
  high?: number;
  traded?: number;
  asOfHour?: number;
  /** Read from a pair under MIN_TRADED: shown, but marked unreliable. */
  thin?: true;
  /** In the core currency, converted once; for ranking and sums only. */
  ordering: number;
}

const ORDER: QuoteCurrency[] = ["exalted", "chaos", "divine"];

/** Units of `to` per one `from`, from the feed; direct pair, else inverse. */
export function quoteRate(
  table: PairTable,
  from: QuoteCurrency,
  to: QuoteCurrency,
): number | undefined {
  if (from === to) return 1;
  const direct = table[QUOTE_IDS[from]]?.[to];
  if (direct && direct.typical > 0) return direct.typical;
  const inverse = table[QUOTE_IDS[to]]?.[from];
  if (inverse && inverse.typical > 0) return 1 / inverse.typical;
  return undefined;
}

/**
 * Whether the core pair's rate is far from the other pair's, compared in the
 * core currency (for the choice only; the display is never converted).
 */
function disagrees(
  coreTypical: number,
  other: QuoteCurrency,
  pairs: ItemPairs,
  table: PairTable,
  core: CoreCurrency,
): boolean {
  const otherTypical = pairs[other]!.typical;
  if (otherTypical < OVERRIDE_MIN_RATE[other]) return false;
  const rate = quoteRate(table, other, core);
  if (rate === undefined) return false;
  const ratio = coreTypical / (otherTypical * rate);
  return ratio > DISAGREE_RATIO || ratio < 1 / DISAGREE_RATIO;
}

export function exchangeValue(query: ExchangeQuery): ExchangeValue | null {
  const { pairs, core, table, ninja } = query;

  const liquid = ORDER.filter((currency) => {
    const pair = pairs?.[currency];
    return pair != null && pair.traded >= MIN_TRADED && pair.typical > 0;
  });
  // With no liquid pair, a thin one still beats poe.ninja: its PoE2 exchange
  // price is the same feed, read from whichever pair traded most (Owl Idol:
  // 7 trades at 4.1 c beat 6 at 6.3 ex, about 310 ex against 6).
  const thin = liquid.length
    ? []
    : ORDER.filter((currency) => {
        const pair = pairs?.[currency];
        return (
          pair != null &&
          pair.traded >= MIN_THIN_TRADED &&
          pair.hours >= MIN_THIN_HOURS &&
          pair.typical > 0
        );
      });
  const candidates = liquid.length ? liquid : thin;

  // The core pair wins unless another pair clearly traded more and the core
  // pair is thin or its rate disagrees with that busier pair; a near tie
  // keeps the price in the core currency.
  const busiest = [...candidates].sort(
    (a, b) => pairs![b]!.traded - pairs![a]!.traded,
  )[0];
  const coreTraded = candidates.includes(core) ? pairs![core]!.traded : 0;
  const clearlyBusier =
    busiest !== undefined &&
    pairs![busiest]!.traded >= BUSIER_FACTOR * coreTraded;
  const own =
    coreTraded > 0 &&
    !(
      clearlyBusier &&
      (coreTraded < THIN_TRADED ||
        disagrees(pairs![core]!.typical, busiest, pairs!, table, core))
    )
      ? core
      : busiest;

  if (own) {
    const pair = pairs![own]!;
    const rate = quoteRate(table, own, core);
    return {
      rule: own === core ? 1 : 2,
      source: "ggg",
      currency: own,
      value: pair.typical,
      low: pair.low,
      high: pair.high,
      traded: pair.traded,
      asOfHour: pair.asOfHour,
      ordering: rate === undefined ? NaN : pair.typical * rate,
      ...(liquid.length ? {} : { thin: true as const }),
    };
  }

  if (ninja && ninja.primaryValue > 0) {
    const rate = quoteRate(table, "divine", core);
    if (rate !== undefined) {
      const value = ninja.primaryValue * rate;
      return {
        rule: 3,
        source: "ninja",
        currency: core,
        value,
        ordering: value,
      };
    }
  }

  return null;
}
