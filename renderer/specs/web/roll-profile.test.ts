import { describe, expect, it } from "vitest";
import {
  profileRoll,
  uniqueRollBadge,
  rollGrade,
} from "@/web/price-check/filters/rollProfile.ts";
import type { RollProfileFile } from "@/web/background/market/rollProfileSchema.ts";

// WP-65: which unique mods matter (research profiles) and how good this
// copy's roll is. No price: the user searches the market for that.
const FILE: RollProfileFile = {
  schemaVersion: 1,
  league: "Forbidden Rites",
  verifiedOn: "2026-11-03",
  uniques: {
    Headhunter: {
      tier: "A",
      summary: "Bought for the rare-mod steal.",
      rolls: [
        {
          statRef: "+# to Strength",
          importance: "good",
          thresholds: { good: 50, great: 55 },
          why: "Attribute requirement",
          evidence: ["G1"],
        },
        {
          statRef: "+# to maximum Life",
          importance: "filler",
          why: "Not why it is bought",
          evidence: [],
        },
      ],
      evidence: {
        G1: {
          kind: "guide",
          url: "https://example.com/hh",
          date: "2026-10-10",
        },
      },
    },
  },
};

describe("profileRoll", () => {
  it("finds a unique's researched roll by stat ref", () => {
    expect(profileRoll(FILE, "Headhunter", "+# to Strength")?.importance).toBe(
      "good",
    );
    expect(profileRoll(FILE, "Headhunter", "+# to Dexterity")).toBeUndefined();
    expect(profileRoll(FILE, "Mageblood", "+# to Strength")).toBeUndefined();
    expect(profileRoll(undefined, "Headhunter", "+# to Strength")).toBe(
      undefined,
    );
  });
});

describe("rollGrade", () => {
  it("calls the top of the range perfect", () => {
    expect(rollGrade({ goodness: 1, value: 60 })).toBe("perfect");
  });

  it("calls the top fifth of the range a top roll", () => {
    expect(rollGrade({ goodness: 0.8, value: 56 })).toBe("top");
    expect(rollGrade({ goodness: 0.79, value: 55 })).toBeUndefined();
  });

  it("says nothing without a range", () => {
    expect(rollGrade({ goodness: undefined, value: 5 })).toBeUndefined();
  });

  it("uses the researched breakpoints when there are any", () => {
    const thresholds = { good: 50, great: 55 };
    expect(rollGrade({ goodness: 0.6, value: 55, thresholds })).toBe("top");
    expect(rollGrade({ goodness: 0.4, value: 51, thresholds })).toBe("good");
    expect(rollGrade({ goodness: 0.2, value: 45, thresholds })).toBe(undefined);
  });

  it("reads breakpoints where lower is better", () => {
    // great < good: a reduced cost, say.
    const thresholds = { good: 20, great: 10 };
    expect(rollGrade({ goodness: 0.9, value: 8, thresholds })).toBe("top");
    expect(rollGrade({ goodness: 0.5, value: 15, thresholds })).toBe("good");
    expect(rollGrade({ goodness: 0.1, value: 25, thresholds })).toBe(undefined);
  });

  it("still calls the very top perfect with breakpoints", () => {
    expect(
      rollGrade({
        goodness: 1,
        value: 60,
        thresholds: { good: 50, great: 55 },
      }),
    ).toBe("perfect");
  });
});

describe("uniqueRollBadge", () => {
  const top = { goodness: 0.95, value: 59 };

  it("grades and names a researched valued mod", () => {
    expect(
      uniqueRollBadge(FILE, "Headhunter", "+# to Strength", {
        goodness: 0.6,
        value: 55,
      }),
    ).toEqual({
      importance: "good",
      why: "Attribute requirement",
      grade: "top",
    });
  });

  it("leaves a researched filler mod ungraded, drawbacks included", () => {
    expect(
      uniqueRollBadge(FILE, "Headhunter", "+# to maximum Life", top),
    ).toEqual({});
  });

  it("grades every ranged mod of a unique nobody researched", () => {
    expect(
      uniqueRollBadge(FILE, "Mageblood", "+# to maximum Life", top),
    ).toEqual({ grade: "top" });
    expect(
      uniqueRollBadge(undefined, "Headhunter", "+# to Strength", top),
    ).toEqual({ grade: "top" });
  });

  it("grades nothing without a range", () => {
    expect(uniqueRollBadge(undefined, "Mageblood", "x", undefined)).toEqual({});
  });
});
