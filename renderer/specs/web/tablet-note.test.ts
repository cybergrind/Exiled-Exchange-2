import { describe, expect, it } from "vitest";
import {
  askFloorText,
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
      level: "money",
      headline: "Always money: Omen chance",
      detail:
        "poe.ninja's price for any Magic Ritual Tablet: mods are not counted. Search prices these mods.",
      floor:
        "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.05 div; poe.ninja had 0.26 on 2026-11-22 (5.1× higher)",
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

  it("dates the Abyss floor against poe.ninja's base price", () => {
    // 2026-11-24 market study: cheapest real-currency asks with 10 uses.
    expect(tabletSummary("Abyss Tablet", "Rare", [])!.floor).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.45 div; poe.ninja had 0.73 (1.6× higher)",
    );
    expect(tabletSummary("Abyss Tablet", "Magic", [])!.floor).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.42 div; poe.ninja had 0.46 (1.1× higher)",
    );
    expect(
      tabletSummary("Not A Tablet", "Rare", [{ statRef: OMENS }]),
    ).not.toHaveProperty("floor");
  });

  // T-8: the 2026-11-24 studies of the other six bases; poe.ninja's figures
  // beside them are poe2-auto's of 2026-11-22, and the line says so.
  it("dates the floor of every base that has one", () => {
    expect(tabletSummary("Ritual Tablet", "Rare", [])!.floor).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.04 div; poe.ninja had 0.055 on 2026-11-22 (1.4× higher)",
    );
    expect(tabletSummary("Overseer Tablet", "Magic", [])!.floor).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.008 div; poe.ninja had 0.018 on 2026-11-22 (2.3× higher)",
    );
    expect(tabletSummary("Temple Tablet", "Rare", [])!.floor).toContain(
      "0.45 div; poe.ninja had 0.73 on 2026-11-22 (1.6× higher)",
    );
    expect(tabletSummary("Delirium Tablet", "Rare", [])!.floor).toContain(
      "0.006 div; poe.ninja had 0.018 on 2026-11-22 (3.0× higher)",
    );
  });

  it("says when the asks are above poe.ninja", () => {
    expect(tabletSummary("Irradiated Tablet", "Magic", [])!.floor).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.08 div; poe.ninja had 0.073 on 2026-11-22 (asks 1.1× higher)",
    );
    expect(askFloorText("Expedition Tablet", "Magic")).toContain(
      "0.06 div; poe.ninja had 0.037 on 2026-11-22 (asks 1.6× higher)",
    );
    expect(askFloorText("Irradiated Tablet", "Normal")).toContain(
      "0.2 div; poe.ninja had 0.11 on 2026-11-22 (asks 1.8× higher)",
    );
  });

  it("has no floor line for a rarity nobody sampled", () => {
    expect(askFloorText("Overseer Tablet", "Normal")).toBeUndefined();
    expect(askFloorText("Temple Tablet", "Normal")).toBeUndefined();
    expect(askFloorText("Not A Tablet", "Rare")).toBeUndefined();
    expect(askFloorText("Abyss Tablet", undefined)).toBeUndefined();
  });

  it("gives a matched combination's source as a tooltip", () => {
    const summary = tabletSummary("Abyss Tablet", "Rare", [
      {
        statRef:
          "Abysses in Map have #% increased chance to lead to an Abyssal Depths",
        value: 15,
      },
      {
        statRef:
          "#% increased chance for Desecrated Currency from Abysses in Map",
        value: 29,
      },
    ])!;
    expect(summary.headline).toBe(
      "Always money: Abyssal Depths · Depths + Desecrated: ~3 div (asks, 2026-11-24)",
    );
    expect(summary.comboNote).toBe(
      "Depths + Desecrated: measured, 698 listed, 2.6 div cheapest, 3.7 div by the 5th seller. Asking prices, not sales.",
    );
  });

  it("has nothing for a normal tablet", () => {
    expect(tabletSummary("Ritual Tablet", "Normal", [])).toBeUndefined();
  });
});
