// GGG Currency Exchange hourly digests -> per-item pair statistics.
// guide/poe-source.html, D2 and WP-11. Pure functions; no I/O.
import type {
  CxHour,
  CxMarket,
  PairStat,
  PairTable,
  QuoteCurrency,
} from "./types.ts";
import { QUOTE_IDS } from "./constants.ts";

/**
 * One hourly digest with the unix hour it was fetched for. The digest itself
 * does not carry its own hour (only `next_change_id`), so callers pass the hour
 * they requested: the `<unix hour>` in CX_FEED_URL/<unix hour>.
 */
export interface CxHourEntry {
  hour: number;
  digest: CxHour;
}

const QUOTE_BY_ID = new Map<string, QuoteCurrency>(
  (Object.entries(QUOTE_IDS) as Array<[QuoteCurrency, string]>).map(
    ([quote, id]) => [id, quote],
  ),
);

/** Quote units per one item from a ratio object, or undefined if unusable. */
export function quotePerItem(
  ratio: Record<string, number>,
  item: string,
  quoteId: string,
): number | undefined {
  const itemSide = ratio[item];
  const quoteSide = ratio[quoteId];
  if (!(itemSide > 0) || !(quoteSide > 0)) return undefined;
  const rate = quoteSide / itemSide;
  return Number.isFinite(rate) ? rate : undefined;
}

/**
 * The (item, quote) directions a market prices: the other side of each quote
 * currency in market_pair. A quote-quote market (divine|exalted) yields both.
 */
function directions(
  market: CxMarket,
): Array<{ item: string; quote: QuoteCurrency; quoteId: string }> {
  const [a, b] = market.market_pair;
  const out: Array<{ item: string; quote: QuoteCurrency; quoteId: string }> =
    [];
  const quoteB = QUOTE_BY_ID.get(b);
  if (quoteB && a !== b) out.push({ item: a, quote: quoteB, quoteId: b });
  const quoteA = QUOTE_BY_ID.get(a);
  if (quoteA && a !== b) out.push({ item: b, quote: quoteA, quoteId: a });
  return out;
}

interface Acc {
  traded: number;
  quoteTraded: number;
  low: number;
  high: number;
  hours: Set<number>;
  asOfHour: number;
}

/**
 * D2 over the given hours for one league. For every market where one side is a
 * quote currency, the other side gets a PairStat keyed by that quote currency:
 * typical = summed quote units ÷ summed item units; low/high = min/max
 * quote-per-item across both lowest_ratio and highest_ratio. Markets with zero
 * volume on either side are skipped. No thinness cut (MIN_TRADED) is applied
 * and the caller chooses the window (WINDOW_HOURS). Input order is irrelevant.
 */
export function aggregatePairs(
  hours: CxHourEntry[],
  league: string,
): PairTable {
  const accs = new Map<string, Map<QuoteCurrency, Acc>>();

  for (const { hour, digest } of hours) {
    for (const market of digest.markets) {
      if (market.league !== league) continue;
      for (const { item, quote, quoteId } of directions(market)) {
        const traded = market.volume_traded[item];
        const quoteTraded = market.volume_traded[quoteId];
        if (!(traded > 0) || !(quoteTraded > 0)) continue;

        let byQuote = accs.get(item);
        if (!byQuote) accs.set(item, (byQuote = new Map()));
        let acc = byQuote.get(quote);
        if (!acc) {
          acc = {
            traded: 0,
            quoteTraded: 0,
            low: Infinity,
            high: -Infinity,
            hours: new Set(),
            asOfHour: hour,
          };
          byQuote.set(quote, acc);
        }
        acc.traded += traded;
        acc.quoteTraded += quoteTraded;
        acc.hours.add(hour);
        acc.asOfHour = Math.max(acc.asOfHour, hour);
        for (const ratio of [market.lowest_ratio, market.highest_ratio]) {
          const rate = quotePerItem(ratio, item, quoteId);
          if (rate === undefined) continue;
          acc.low = Math.min(acc.low, rate);
          acc.high = Math.max(acc.high, rate);
        }
      }
    }
  }

  const table: PairTable = {};
  for (const [item, byQuote] of accs) {
    const pairs: PairTable[string] = {};
    for (const [quote, acc] of byQuote) {
      const typical = acc.quoteTraded / acc.traded;
      // A traded hour whose ratios were unusable leaves the range at typical.
      const stat: PairStat = {
        typical,
        low: Number.isFinite(acc.low) ? acc.low : typical,
        high: Number.isFinite(acc.high) ? acc.high : typical,
        traded: acc.traded,
        quoteTraded: acc.quoteTraded,
        hours: acc.hours.size,
        asOfHour: acc.asOfHour,
      };
      pairs[quote] = stat;
    }
    table[item] = pairs;
  }
  return table;
}
