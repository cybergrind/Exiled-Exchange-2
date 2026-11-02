// The one place that decides which price an exchange item shows.
// guide/poe-source.html, D2: never convert a pair rate through the divine rate
// for display; that is the defect this replaces.

import { MIN_TRADED, QUOTE_IDS, THIN_TRADED } from "./constants.ts";
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

export function exchangeValue(query: ExchangeQuery): ExchangeValue | null {
  const { pairs, core, table, ninja } = query;

  const liquid = ORDER.filter((currency) => {
    const pair = pairs?.[currency];
    return pair != null && pair.traded >= MIN_TRADED && pair.typical > 0;
  });

  // The core pair wins unless it is thin and another pair traded more.
  const busiest = [...liquid].sort(
    (a, b) => pairs![b]!.traded - pairs![a]!.traded,
  )[0];
  const own =
    liquid.includes(core) && pairs![core]!.traded >= THIN_TRADED
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
