export interface Sparkline {
  /** Percent change over the window, as poe.ninja computes it. */
  totalChange: number;
  /** Percent change of each sample against the window start; gaps are null. */
  data: Array<number | null>;
}

export interface Trend {
  forecast: "up" | "down" | "const";
  text: string;
  graph: { points: number[]; drawMin: number; drawMax: number };
}

/** A change this small, in percent, reads as "holds". */
export const TREND_HOLDS_PERCENT = 2;

export function trendFromSparkline(sparkline: Sparkline): Trend | null {
  const points = sparkline.data.filter((p): p is number => p != null);
  if (points.length < 2) return null;

  const change = sparkline.totalChange;
  const forecast =
    change > TREND_HOLDS_PERCENT
      ? "up"
      : change < -TREND_HOLDS_PERCENT
        ? "down"
        : "const";

  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = (max - min) * 0.1 || 1;

  return {
    forecast,
    text: `${Math.round(Math.abs(change))}\u2009%`,
    graph: { points, drawMin: min - pad, drawMax: max + pad },
  };
}
