import { describe, expect, it } from "vitest";
import {
  historyPoint,
  mergeHistory,
  parseHistory,
  serializePoint,
} from "@/web/background/market/history.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import { historySeries } from "@/web/price-check/trends/historySeries.ts";
import { cxHour, cxHourIds } from "./market/prices-harness";

const LEAGUE = "Forbidden Rites";
const ETCHER = "Metadata/Items/Currency/CurrencyMagicQuality";
const HOURS = cxHourIds();
const NEWEST = HOURS.at(-1)!;
const NOW = (NEWEST + 2 * 3600) * 1000;
const DAY = 86400;

function line(hour: number, at = hour) {
  const table = aggregatePairs(
    [{ hour, digest: JSON.parse(cxHour(hour)) }],
    LEAGUE,
  );
  return serializePoint(historyPoint(at, table));
}

function points(lines: string[]) {
  return parseHistory(mergeHistory("", lines.join("\n"), NOW).text).points;
}

describe("historySeries", () => {
  it("gives one point per hour with typical, range and volume", () => {
    const series = historySeries(
      points(HOURS.map((h) => line(h))),
      ETCHER,
      "exalted",
      "all",
      NOW,
    )!;
    expect(series.map((p) => p.t)).toEqual(HOURS.map((h) => h * 1000));
    const newest = JSON.parse(line(NEWEST)).pairs[ETCHER].exalted;
    expect(series.at(-1)).toEqual({
      t: NEWEST * 1000,
      typical: newest[0],
      low: newest[1],
      high: newest[2],
      traded: newest[3],
      period: "hour",
    });
  });

  it("skips hours the item did not trade on that pair", () => {
    const series = historySeries(
      points(HOURS.map((h) => line(h))),
      ETCHER,
      "divine",
      "all",
      NOW,
    );
    for (const p of series ?? []) expect(p.traded).toBeGreaterThan(0);
  });

  it("returns null under two points, so the sparkline stays", () => {
    expect(
      historySeries(points([line(NEWEST)]), ETCHER, "exalted", "all", NOW),
    ).toBeNull();
    expect(historySeries([], ETCHER, "exalted", "all", NOW)).toBeNull();
    expect(
      historySeries(
        points(HOURS.map((h) => line(h))),
        "Metadata/Not/Traded",
        "exalted",
        "all",
        NOW,
      ),
    ).toBeNull();
  });

  it("limits the range to 24 h, 7 d or everything kept", () => {
    const today = Math.floor(NEWEST / DAY) * DAY;
    const all = points([
      line(HOURS[0], today - 10 * DAY + 3600), // rolled into a day line
      line(HOURS[1], NEWEST - 3 * DAY), // hourly, three days back
      line(HOURS[2], NEWEST - 3600),
      line(NEWEST),
    ]);
    const t = (range: "24h" | "7d" | "all") =>
      historySeries(all, ETCHER, "exalted", range, NOW)?.map((p) => p.period);
    expect(t("24h")).toEqual(["hour", "hour"]);
    expect(t("7d")).toEqual(["hour", "hour", "hour"]);
    expect(t("all")).toEqual(["day", "hour", "hour", "hour"]);
  });
});
