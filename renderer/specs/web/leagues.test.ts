import { describe, expect, it } from "vitest";
import { isOlderLeague, pickDefaultLeague } from "@/web/background/Leagues";

// Order returned by /api/trade2/data/leagues on 2026-11-02.
const TODAY = [
  "Forbidden Rites",
  "HC Forbidden Rites",
  "Runes of Aldur",
  "HC Runes of Aldur",
  "Standard",
  "Hardcore",
];
// The order the old index-2 rule was written for.
const LEGACY = ["Standard", "Hardcore", "Forbidden Rites", "HC Forbidden Rites"];

describe("pickDefaultLeague", () => {
  it("picks the current challenge league in today's order", () => {
    expect(pickDefaultLeague(TODAY)).toBe("Forbidden Rites");
  });

  it("picks the challenge league in the older order", () => {
    expect(pickDefaultLeague(LEGACY)).toBe("Forbidden Rites");
  });

  it("skips hardcore, ruthless and private leagues", () => {
    expect(
      pickDefaultLeague([
        "HC Forbidden Rites",
        "Ruthless Forbidden Rites",
        "My League (PL12345)",
        "Forbidden Rites",
      ]),
    ).toBe("Forbidden Rites");
  });

  it("falls back to Standard when there is no challenge league", () => {
    expect(pickDefaultLeague(["Hardcore", "Standard"])).toBe("Standard");
  });

  it("returns undefined for an empty list", () => {
    expect(pickDefaultLeague([])).toBeUndefined();
  });
});

describe("isOlderLeague", () => {
  it("flags last league and its hardcore twin", () => {
    expect(isOlderLeague("Runes of Aldur", TODAY)).toBe(true);
    expect(isOlderLeague("HC Runes of Aldur", TODAY)).toBe(true);
  });

  it("accepts the current league, its hardcore twin and permanent leagues", () => {
    expect(isOlderLeague("Forbidden Rites", TODAY)).toBe(false);
    expect(isOlderLeague("HC Forbidden Rites", TODAY)).toBe(false);
    expect(isOlderLeague("Standard", TODAY)).toBe(false);
    expect(isOlderLeague("Hardcore", TODAY)).toBe(false);
  });

  it("leaves private leagues and unknown ids alone", () => {
    expect(isOlderLeague("My League (PL12345)", TODAY)).toBe(false);
    expect(isOlderLeague("Not Listed", TODAY)).toBe(false);
  });
});
