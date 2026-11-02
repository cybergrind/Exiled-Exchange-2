import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatRange,
  formatRate,
} from "@/web/background/market/format.ts";

describe("formatCount", () => {
  it("keeps small counts whole", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(58)).toBe("58");
    expect(formatCount(999.4)).toBe("999");
  });

  it("shortens thousands and millions to three significant digits", () => {
    expect(formatCount(2456)).toBe("2.5k");
    expect(formatCount(12_345)).toBe("12.3k");
    expect(formatCount(440_747)).toBe("441k");
    expect(formatCount(1_901_049)).toBe("1.9M");
    expect(formatCount(7_502_377)).toBe("7.5M");
    expect(formatCount(45_600_000)).toBe("45.6M");
  });

  it("carries rounding into the next unit", () => {
    expect(formatCount(999_600)).toBe("1M");
  });
});

describe("formatRange", () => {
  it("writes both ends in the same unit", () => {
    // Verisium's divine pair, as seen in-game: 1/16.4k – 1/6002 before.
    expect(formatRange(1 / 16_400, 1 / 6002)).toBe("1/16.4k – 1/6k");
    expect(formatRange(1 / 1800, 1 / 500)).toBe("1/1800 – 1/500");
    expect(formatRange(1 / 25, 1 / 8)).toBe("1/25 – 1/8");
    expect(formatRange(3, 14)).toBe("3 – 14");
  });

  it("collapses a range whose ends print the same", () => {
    expect(formatRange(12, 12.02)).toBe("12");
  });
});

describe("formatRate", () => {
  it("keeps the typical rate precise below ten thousand", () => {
    expect(formatRate(1 / 1347)).toBe("1/1347");
    expect(formatRate(1 / 13_400)).toBe("1/13.4k");
  });
});
