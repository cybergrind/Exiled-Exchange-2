// One item's pair over time, for the history chart (guide/poe-source.html,
// WP-31). Pure: the caller loads and parses the history file.
import type {
  HistoryPoint,
  HistoryStat,
} from "../../background/market/history.ts";
import type { QuoteCurrency } from "../../background/market/types.ts";

export type HistoryRange = "24h" | "7d" | "all";

export interface SeriesPoint {
  /** Start of the hour or day, in milliseconds. */
  t: number;
  typical: number;
  low: number;
  high: number;
  /** Item units traded in the period. */
  traded: number;
  period: "hour" | "day";
}

const RANGE_MS: Record<HistoryRange, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "all": Number.POSITIVE_INFINITY,
};

/** Null when fewer than two points remain: the caller keeps the sparkline. */
export function historySeries(
  points: readonly HistoryPoint[],
  id: string,
  quote: QuoteCurrency,
  range: HistoryRange,
  nowMs: number,
): SeriesPoint[] | null {
  const from = nowMs - RANGE_MS[range];
  const out: SeriesPoint[] = [];
  for (const point of points) {
    const isDay = "day" in point;
    const t = (isDay ? point.day : point.hour) * 1000;
    if (t < from) continue;
    const stat: HistoryStat | undefined = point.pairs[id]?.[quote];
    if (!stat || stat[3] <= 0) continue;
    out.push({
      t,
      typical: stat[0],
      low: stat[1],
      high: stat[2],
      traded: stat[3],
      period: isDay ? "day" : "hour",
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length >= 2 ? out : null;
}
