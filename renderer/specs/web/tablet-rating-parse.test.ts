import { beforeAll, describe, expect, it } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { createExactStatFilters } from "@/web/price-check/filters/create-stat-filters";
import { rateTablet } from "@/web/price-check/tablets/tabletRating";

// Clipboard text through the parser into the rating, as the price check does.
function rate(text: string) {
  const item = parseClipboard(text)._unsafeUnwrap();
  return rateTablet(item.info.refName, item.rarity, [
    ...item.statsByType.map((calc) => ({
      statRef: calc.stat.ref,
      value: calc.sources.reduce(
        (sum, s) => sum + (s.contributes?.value ?? 0),
        0,
      ),
    })),
  ]);
}

// Advanced copy (Ctrl+Alt+C), as the app reads items; without the mod
// headers a tablet's mod lines are not parsed.
function tablet(rarity: string, base: string, mods: string[]) {
  const name = rarity === "Magic" ? base : `Grim Charm\n${base}`;
  const lines = mods.flatMap((mod, i) => [
    `{ ${i % 2 ? "Suffix" : "Prefix"} Modifier "Test" }`,
    mod,
  ]);
  return `Item Class: Tablet
Rarity: ${rarity}
${name}
--------
Item Level: 80
--------
${lines.join("\n")}
--------
Can be used in a personal Map Device to add modifiers to a Map.
`;
}

describe("tablet rating from clipboard text", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("rates the experience tablet from the screenshot as niche", () => {
    const verdict = rate(
      tablet("Magic", "Ritual Tablet", [
        "13% increased Experience gain in Map",
        "Unique Monsters have 1 additional Rare Modifier",
      ]),
    )!;
    expect(verdict.level).toBe("niche");
    expect(verdict.rated.map((m) => m.short)).toEqual(["Experience"]);
    expect(verdict.rated[0].roll).toBeCloseTo(1 / 6, 5);
  });

  it("rates rerolls, omens and cheaper rerolls on a rare ritual tablet", () => {
    const verdict = rate(
      tablet("Rare", "Ritual Tablet", [
        "Ritual Altars in Map allow rerolling Favours 2 additional times",
        "Ritual Favours in Map have 60% increased chance to be Omens",
        "Rerolling Favours at Ritual Altars in Map costs 25% reduced Tribute",
        "Map has 2 additional random Modifiers",
      ]),
    )!;
    expect(verdict.level).toBe("money");
    expect(verdict.text).toBe("Always money: Favour rerolls, Random map mods");
    expect(verdict.rated.map((m) => [m.short, m.roll])).toEqual([
      ["Favour rerolls", 0.5],
      ["Random map mods", 1],
      ["Omen chance", (60 - 35) / 35],
      ["Cheaper rerolls", 0.5],
    ]);
  });

  it("reads the Expedition Remnant mod and the Mirror Shards mod", () => {
    const verdict = rate(
      tablet("Magic", "Expedition Tablet", [
        "Expeditions have +35% Surpassing chance to contain an additional Verisium Remnant",
      ]),
    )!;
    expect(verdict.text).toBe("Always money: Extra Remnant");
    expect(verdict.rated[0].roll).toBe(0.5);
    const shards = rate(
      tablet("Magic", "Delirium Tablet", [
        "Delirium Fog in Map spawns 19% increased Mirror Shards",
      ]),
    )!;
    expect(shards.text).toBe("Good mod: Mirror Shards");
  });

  it("reads a mod with a plus sign inside its text", () => {
    // stats.ndjson had "+#%" mid-text, which the parser never matches.
    const verdict = rate(
      tablet("Magic", "Expedition Tablet", [
        "Verisium Remnants have +30% chance to add an additional Runic Modifier in Map",
      ]),
    )!;
    expect(verdict.text).toBe("Good mod: Runic Modifier");
    expect(verdict.rated[0].roll).toBe(0.5);
  });

  it("reads the Verisium mod as a positive roll", () => {
    const item = parseClipboard(
      tablet("Magic", "Expedition Tablet", [
        "Monsters from Verisium Remnants drop 20% increased Verisium",
      ]),
    )._unsafeUnwrap();
    expect(item.statsByType[0].sources[0].contributes?.value).toBe(20);
  });
});

describe("tablet search filters from clipboard text", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  const enabledRefs = (text: string, defaultAllSelected = false) => {
    const item = parseClipboard(text)._unsafeUnwrap();
    return createExactStatFilters(item, item.statsByType, {
      searchStatRange: 10,
      defaultAllSelected,
    })
      .filter((f) => !f.disabled)
      .map((f) => f.statRef);
  };

  it("ticks the rated mods of a rare ritual tablet, not the filler", () => {
    const text = tablet("Rare", "Ritual Tablet", [
      "Ritual Favours in Map have 60% increased chance to be Omens",
      "Map has 2 additional random Modifiers",
      "25% increased Gold found in Map",
    ]);
    expect(enabledRefs(text)).toEqual([
      "Ritual Favours in Map have #% increased chance to be Omens",
      "Map has # additional random Modifier",
    ]);
    // The "select all mods" setting still wins.
    expect(enabledRefs(text, true)).toContain("#% increased Gold found in Map");
  });
});
