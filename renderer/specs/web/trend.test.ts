import { describe, expect, it } from "vitest";
import { trendFromSparkline } from "@/web/price-check/trends/trend";

// Sparklines recorded from poe.ninja on 2026-11-02.
const ETCHER_RUNES_OF_ALDUR = {
  totalChange: -89.89,
  data: [-91.17, -94.39, -90.71, -85.3, -69.27, -91.67, -89.89],
};
const RUNESEEKERS_CALL = {
  totalChange: 338.9,
  data: [0, null, 120.4, 210.0, 280.3, null, 338.9],
};

describe("trendFromSparkline", () => {
  it("reports the 7-day change, not the spread of the samples", () => {
    const trend = trendFromSparkline(ETCHER_RUNES_OF_ALDUR)!;
    expect(trend.forecast).toBe("down");
    expect(trend.text).toBe("90\u2009%");
  });

  it("reports a rise as up", () => {
    const trend = trendFromSparkline({ totalChange: 150, data: [0, 40, 150] })!;
    expect(trend.forecast).toBe("up");
    expect(trend.text).toBe("150\u2009%");
  });

  it("treats a change within 2% as holding", () => {
    expect(
      trendFromSparkline({ totalChange: -0.29, data: [2, 8.8, -0.29] })!
        .forecast,
    ).toBe("const");
    expect(
      trendFromSparkline({ totalChange: 2, data: [1, 2] })!.forecast,
    ).toBe("const");
  });

  it("draws through gaps in the samples", () => {
    const trend = trendFromSparkline(RUNESEEKERS_CALL)!;
    expect(trend.graph.points).toEqual([0, 120.4, 210.0, 280.3, 338.9]);
    expect(trend.graph.drawMin).toBeLessThan(0);
    expect(trend.graph.drawMax).toBeGreaterThan(338.9);
  });

  it("has nothing to draw with fewer than two samples", () => {
    expect(trendFromSparkline({ totalChange: 0, data: [null, 3] })).toBeNull();
  });

  it("pads a flat line so it stays visible", () => {
    const trend = trendFromSparkline({ totalChange: 0, data: [0, 0, 0] })!;
    expect(trend.graph.drawMin).toBeLessThan(0);
    expect(trend.graph.drawMax).toBeGreaterThan(0);
  });
});
