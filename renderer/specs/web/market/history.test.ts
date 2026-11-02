import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  HISTORY_DAYS,
  HOURLY_DAYS,
  historyPoint,
  mergeHistory,
  parseHistory,
  pointTime,
  serializePoint,
} from "@/web/background/market/history.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import { cxHour, cxHourIds } from "./prices-harness";

const LEAGUE = "Forbidden Rites";
const ETCHER = "Metadata/Items/Currency/CurrencyMagicQuality";
const HOURS = cxHourIds();
const DAY = 86400;

function hourLine(hour: number, at = hour): string {
  // `at` lets a recorded hour stand in for another one, for retention tests.
  const table = aggregatePairs(
    [{ hour, digest: JSON.parse(cxHour(hour)) }],
    LEAGUE,
  );
  return serializePoint(historyPoint(at, table));
}

const nowAfter = (hour: number) => (hour + 2 * 3600) * 1000;

describe("history points", () => {
  it("stores one line per hour with every pair of the league", () => {
    const line = hourLine(HOURS[0]);
    expect(line).not.toContain("\n");
    const point = JSON.parse(line);
    expect(point).toMatchObject({ v: 1, hour: HOURS[0] });
    const etcher = point.pairs[ETCHER].exalted;
    const table = aggregatePairs(
      [{ hour: HOURS[0], digest: JSON.parse(cxHour(HOURS[0])) }],
      LEAGUE,
    );
    const stat = table[ETCHER].exalted!;
    expect(etcher).toEqual([
      stat.typical,
      stat.low,
      stat.high,
      stat.traded,
      stat.quoteTraded,
    ]);
  });
});

describe("mergeHistory", () => {
  it("stores an hour sent twice once", () => {
    const first = mergeHistory("", hourLine(HOURS[0]), nowAfter(HOURS[0]));
    expect(first.added).toEqual([HOURS[0]]);
    const again = mergeHistory(
      first.text,
      `${hourLine(HOURS[0])}\n${hourLine(HOURS[1])}`,
      nowAfter(HOURS[1]),
    );
    expect(again.added).toEqual([HOURS[1]]);
    expect(again.text.trimEnd().split("\n")).toHaveLength(2);
  });

  it("keeps the lines in hour order", () => {
    const text = mergeHistory(
      "",
      [HOURS[3], HOURS[0], HOURS[2]].map((h) => hourLine(h)).join("\n"),
      nowAfter(HOURS[3]),
    ).text;
    const hours = text
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l).hour);
    expect(hours).toEqual([HOURS[0], HOURS[2], HOURS[3]]);
  });

  it("skips a corrupt line and keeps the rest", () => {
    const existing = `${hourLine(HOURS[0])}\n{"v":1,"hour":\n`;
    const merged = mergeHistory(
      existing,
      hourLine(HOURS[1]),
      nowAfter(HOURS[1]),
    );
    expect(merged.skipped).toBe(1);
    expect(parseHistory(merged.text).points.map(pointTime)).toEqual([
      HOURS[0],
      HOURS[1],
    ]);
  });

  it(`rolls hours older than ${HOURLY_DAYS} days into one line per day`, () => {
    // Two recorded hours placed on the same day, eight days back.
    const day = Math.floor(HOURS[0] / DAY) * DAY - 8 * DAY;
    const text = [
      hourLine(HOURS[0], day + 3600),
      hourLine(HOURS[1], day + 7200),
    ].join("\n");
    const merged = mergeHistory("", text, nowAfter(HOURS[5]));
    const points = parseHistory(merged.text).points;
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ day, hours: [day + 3600, day + 7200] });

    const a = JSON.parse(hourLine(HOURS[0])).pairs[ETCHER].exalted;
    const b = JSON.parse(hourLine(HOURS[1])).pairs[ETCHER].exalted;
    const [typical, low, high, traded, quoteTraded] =
      points[0].pairs[ETCHER].exalted!;
    expect(traded).toBe(a[3] + b[3]);
    expect(quoteTraded).toBeCloseTo(a[4] + b[4], 6);
    expect(typical).toBeCloseTo((a[4] + b[4]) / (a[3] + b[3]), 9);
    expect(low).toBe(Math.min(a[1], b[1]));
    expect(high).toBe(Math.max(a[2], b[2]));
  });

  it("does not add an hour again once its day holds it", () => {
    const day = Math.floor(HOURS[0] / DAY) * DAY - 8 * DAY;
    const rolled = mergeHistory(
      "",
      hourLine(HOURS[0], day + 3600),
      nowAfter(HOURS[5]),
    );
    const again = mergeHistory(
      rolled.text,
      hourLine(HOURS[0], day + 3600),
      nowAfter(HOURS[5]),
    );
    expect(again.added).toEqual([]);
    expect(again.text).toBe(rolled.text);
  });

  it(`drops points older than ${HISTORY_DAYS} days`, () => {
    const old = Math.floor(HOURS[0] / DAY) * DAY - (HISTORY_DAYS + 1) * DAY;
    const merged = mergeHistory(
      "",
      `${hourLine(HOURS[0], old)}\n${hourLine(HOURS[1])}`,
      nowAfter(HOURS[1]),
    );
    expect(parseHistory(merged.text).points.map(pointTime)).toEqual([HOURS[1]]);
  });

  it("converts the earlier one-line-per-pair format, duplicates and all", () => {
    const point = JSON.parse(hourLine(HOURS[0]));
    const legacy: string[] = [];
    for (const [id, quotes] of Object.entries(point.pairs)) {
      for (const [quote, s] of Object.entries(
        quotes as Record<string, number[]>,
      )) {
        const line = JSON.stringify({
          hour: HOURS[0],
          id,
          quote,
          typical: s[0],
          low: s[1],
          high: s[2],
          traded: s[3],
          quoteTraded: s[4],
        });
        legacy.push(line, line); // sent twice, as each app start did
      }
    }
    const merged = mergeHistory(legacy.join("\n"), "", nowAfter(HOURS[0]));
    expect(merged.text.trimEnd()).toBe(hourLine(HOURS[0]));
  });
});

describe("history.ts", () => {
  it("has only type imports, so main can bundle it", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/web/background/market/history.ts"),
      "utf8",
    );
    const imports = source.match(/^import .*$/gm) ?? [];
    for (const line of imports) expect(line).toMatch(/^import type /);
  });
});
