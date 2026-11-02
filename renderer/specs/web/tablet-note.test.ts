import { describe, expect, it } from "vitest";
import {
  tabletNote,
  tabletSummary,
} from "@/web/price-check/trends/tabletNote.ts";

// poe.ninja's tablet price ignores mods; the panel says so for magic and rare.
describe("tabletNote", () => {
  it("says a magic or rare tablet's mods are not priced", () => {
    expect(tabletNote("Ritual Tablet", "Magic")).toBe(
      "poe.ninja's price for any Magic Ritual Tablet: mods are not counted. Search prices these mods.",
    );
    expect(tabletNote("Breach Tablet", "Rare")).toContain(
      "any Rare Breach Tablet",
    );
  });

  it("says nothing for a normal tablet or without a rarity", () => {
    expect(tabletNote("Ritual Tablet", "Normal")).toBeUndefined();
    expect(tabletNote("Ritual Tablet", undefined)).toBeUndefined();
  });
});

describe("tabletSummary", () => {
  const OMENS = "Ritual Favours in Map have #% increased chance to be Omens";
  const GOLD = "#% increased Gold found in Map";

  it("gives the verdict and says the price ignores mods", () => {
    expect(
      tabletSummary("Ritual Tablet", "Magic", [{ statRef: OMENS, value: 50 }]),
    ).toEqual({
      level: "good",
      headline: "Good mod: Omen chance",
      detail:
        "poe.ninja's price for any Magic Ritual Tablet: mods are not counted. Search prices these mods.",
    });
  });

  it("points a tablet without valued mods to the normal tablet's price", () => {
    const summary = tabletSummary(
      "Ritual Tablet",
      "Magic",
      [{ statRef: GOLD, value: 30 }],
      "302 ex",
    )!;
    expect(summary.level).toBe("none");
    expect(summary.detail).toBe(
      "A Normal Ritual Tablet is 302 ex on poe.ninja.",
    );
    expect(
      tabletSummary("Ritual Tablet", "Magic", [{ statRef: GOLD }])!.detail,
    ).toContain("mods are not counted");
  });

  it("has nothing for a normal tablet", () => {
    expect(tabletSummary("Ritual Tablet", "Normal", [])).toBeUndefined();
  });
});
