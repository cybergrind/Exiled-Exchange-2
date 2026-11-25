import { describe, expect, it } from "vitest";
import {
  rateTablet,
  TABLET_COMBOS,
  TABLET_RATINGS,
  tabletModRating,
} from "@/web/price-check/tablets/tabletRating.ts";
import type { TabletModInput } from "@/web/price-check/tablets/tabletRating.ts";
import fs from "fs";
import path from "path";

// Highlighting for tablet mods (research/tablets/values.md): each base's
// valued mods are "always money", "good" or a "multiplier"; a magic or rare
// tablet without any is worth less than a normal one.
const mod = (statRef: string, value?: number): TabletModInput => ({
  statRef,
  value,
});

const OMENS = "Ritual Favours in Map have #% increased chance to be Omens";
const REROLLS =
  "Ritual Altars in Map allow rerolling Favours an additional time";
const RARITY = "#% increased Rarity of Items found";
const EXPERIENCE = "#% increased Experience gain";
const UNIQUE_RARE_MOD = "Unique Monsters have # additional Rare Modifier";

describe("tabletModRating", () => {
  it("rates a mod by the tablet it is on", () => {
    expect(tabletModRating("Ritual Tablet", REROLLS)?.tier).toBe("money");
    // 2026-11-24 market study: omen chance alone asks about 94 ex.
    expect(tabletModRating("Ritual Tablet", OMENS)?.tier).toBe("money");
    expect(tabletModRating("Abyss Tablet", RARITY)?.tier).toBe("multiplier");
    expect(tabletModRating("Ritual Tablet", UNIQUE_RARE_MOD)).toBeUndefined();
    expect(tabletModRating("Not A Tablet", RARITY)).toBeUndefined();
  });

  it("knows a rated mod's roll range and gives the roll's position in it", () => {
    const rating = tabletModRating("Ritual Tablet", OMENS)!;
    expect(rating.range).toEqual([35, 70]);
    expect(
      rateTablet("Ritual Tablet", "Magic", [mod(OMENS, 70)])!.rated[0].roll,
    ).toBe(1);
    expect(
      rateTablet("Ritual Tablet", "Magic", [mod(OMENS, 35)])!.rated[0].roll,
    ).toBe(0);
  });

  it("reads a reduced-cost roll by its size", () => {
    const cost =
      "Rerolling Favours at Ritual Altars in Map costs #% increased Tribute";
    const rated = rateTablet("Ritual Tablet", "Magic", [mod(cost, -30)])!.rated;
    expect(rated[0].tier).toBe("multiplier");
    expect(rated[0].roll).toBe(1);
  });

  it("names only stat refs that exist in the stat data", () => {
    const refs = new Set(
      fs
        .readFileSync(
          path.resolve(__dirname, "../../public/data/en/stats.ndjson"),
          "utf8",
        )
        .split("\n")
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { ref: string }).ref),
    );
    const missing = Object.values(TABLET_RATINGS)
      .flatMap((base) => Object.keys(base))
      .filter((ref) => !refs.has(ref));
    expect(missing).toEqual([]);
  });
});

describe("rateTablet", () => {
  it("says nothing for normal tablets", () => {
    expect(rateTablet("Ritual Tablet", "Normal", [])).toBeUndefined();
  });

  it("calls an always-money mod out first", () => {
    const verdict = rateTablet("Ritual Tablet", "Rare", [
      mod(REROLLS, 2),
      mod(EXPERIENCE, 13),
    ])!;
    expect(verdict.level).toBe("money");
    // On a rare, the mod alone is a priced set too (T-8).
    expect(verdict.text).toBe(
      "Always money: Favour rerolls · Favour rerolls: ~11 div (asks, 2026-11-24)",
    );
  });

  it("rates a good mod with a multiplier as well rolled", () => {
    const verdict = rateTablet("Abyss Tablet", "Magic", [
      mod("Abyss Pits in Map are twice as likely to have Rewards"),
      mod(RARITY, 10),
    ])!;
    expect(verdict.level).toBe("combo");
    expect(verdict.text).toBe("Well rolled: Pit rewards + Item rarity");
  });

  it("counts several multipliers rather than naming each", () => {
    // The Rare Overseer Tablet from the screenshot. Boss waystones are a
    // multiplier since the 2026-11-24 study, and with map waystones a
    // priced set (T-8).
    const verdict = rateTablet("Overseer Tablet", "Rare", [
      mod("Monsters have #% increased Effectiveness", 11),
      mod("Map has #% increased Monster Rarity", 19),
      mod("#% increased Quantity of Waystones dropped by Map Bosses", 24),
      mod("#% increased Quantity of Waystones found in Map", 30),
    ])!;
    expect(verdict.level).toBe("multiplier");
    expect(verdict.text).toBe(
      "Multiplier only: 4 multipliers · Boss waystones + Waystones: ~5 div (asks, 2026-11-24)",
    );
    expect(
      rateTablet("Overseer Tablet", "Rare", [
        mod("Monsters have #% increased Effectiveness", 11),
        mod("Map has #% increased Monster Rarity", 19),
        mod("#% increased Rarity of Items dropped by Map Bosses", 40),
        mod("#% increased Quantity of Waystones found in Map", 30),
      ])!.text,
    ).toBe("Well rolled: Boss rarity + 3 multipliers");
    expect(
      rateTablet("Abyss Tablet", "Magic", [
        mod(RARITY, 10),
        mod("Map has #% increased Monster Rarity", 19),
      ])!.text,
    ).toBe("Multiplier only: 2 multipliers");
  });

  it("rates one good mod as good", () => {
    const verdict = rateTablet("Delirium Tablet", "Magic", [
      mod("Delirium Fog in Map spawns #% increased Fracturing Mirrors", 20),
    ])!;
    expect(verdict.level).toBe("good");
    expect(verdict.text).toBe("Good mod: Fracturing Mirrors");
  });

  it("rates only multipliers as a multiplier tablet", () => {
    const verdict = rateTablet("Abyss Tablet", "Magic", [mod(RARITY, 10)])!;
    expect(verdict.level).toBe("multiplier");
    expect(verdict.text).toBe("Multiplier only: Item rarity");
  });

  it("rates experience as niche, and a unique-monster mod only where wanted", () => {
    const verdict = rateTablet("Ritual Tablet", "Magic", [
      mod(EXPERIENCE, 13),
      mod(UNIQUE_RARE_MOD, 1),
    ])!;
    expect(verdict.level).toBe("niche");
    expect(verdict.text).toBe("Niche: Experience, for levelling buyers");
    expect(tabletModRating("Temple Tablet", UNIQUE_RARE_MOD)?.tier).toBe(
      "good",
    );
  });

  it("rates extra random map mods as always money on any tablet", () => {
    for (const base of Object.keys(TABLET_RATINGS)) {
      expect(
        tabletModRating(base, "Map has # additional random Modifier")?.tier,
      ).toBe("money");
    }
  });

  it("follows patch 0.5.5 over the older video board", () => {
    expect(
      tabletModRating(
        "Breach Tablet",
        "Unstable Breaches in Map spawn an additional Rare Monster when Stabilised",
      )?.tier,
    ).toBe("good");
    expect(
      tabletModRating(
        "Overseer Tablet",
        "Map is inhabited by # additional Rogue Exile",
      ),
    ).toBeUndefined();
  });

  it("follows the 2026-11-18 Abyss refresh (research/tablets/abyss-2026-11.md)", () => {
    const abyss = (ref: string) => tabletModRating("Abyss Tablet", ref)?.tier;
    // The Trove/Cranium farm's pair.
    expect(
      abyss("#% increased chance for Desecrated Currency from Abysses in Map"),
    ).toBe("good");
    expect(abyss("Abyss Pits in Map are twice as likely to have Rewards")).toBe(
      "good",
    );
    // The Omen of Light farm's priorities, on Abyss only.
    expect(abyss("Map has #% increased number of Rare Monsters")).toBe("good");
    expect(abyss("Map is inhabited by # additional Rogue Exile")).toBe(
      "multiplier",
    );
    expect(
      tabletModRating(
        "Ritual Tablet",
        "Map has #% increased number of Rare Monsters",
      )?.tier,
    ).toBe("multiplier");
    // No 0.5.5 source after 2026-10-22: filler.
    expect(
      abyss(
        "Abyssal Monsters have #% increased Effectiveness for each closed Pit, up to 100%",
      ),
    ).toBeUndefined();
    // Reported to work in reverse (2026-11-18), but the 2026-11-24 market
    // study prices it highest of all Abyss mods: always money now.
    expect(
      abyss(
        "Abysses in Map have #% increased chance to lead to an Abyssal Depths",
      ),
    ).toBe("money");
  });

  it("rates the Expedition Remnant mod", () => {
    const verdict = rateTablet("Expedition Tablet", "Rare", [
      mod(
        "Expeditions have #% Surpassing chance to contain an additional Verisium Remnant",
        35,
      ),
    ])!;
    expect(verdict.text).toBe(
      "Always money: Extra Remnant · Extra Remnant: ~1 div (asks, 2026-11-24)",
    );
  });

  it("calls a tablet without valued mods worth less than a normal one", () => {
    const verdict = rateTablet("Ritual Tablet", "Magic", [
      mod("#% increased Gold found in Map", 30),
      mod(UNIQUE_RARE_MOD, 1),
    ])!;
    expect(verdict.level).toBe("none");
    expect(verdict.rated).toEqual([]);
    expect(verdict.text).toBe(
      "No valued mods: usually worth less than a Normal Ritual Tablet",
    );
  });
});

// The 2026-11-24 Abyss market study (research/tablets/abyss-market-2026-11-24.md):
// pairs the market prices, from real-currency asks on rare tablets.
describe("measured tablet combinations", () => {
  const DEPTHS =
    "Abysses in Map have #% increased chance to lead to an Abyssal Depths";
  const DESECRATED =
    "#% increased chance for Desecrated Currency from Abysses in Map";
  const PIT_REWARDS = "Abyss Pits in Map are twice as likely to have Rewards";
  const RARES = "Map has #% increased number of Rare Monsters";
  const ABYSS_RARES =
    "# additional Rare Monsters are spawned from Abysses in Map";
  const GOLD = "#% increased Gold found in Map";

  it("names only stat refs that exist in the stat data, with a source", () => {
    const refs = new Set(
      fs
        .readFileSync(
          path.resolve(__dirname, "../../public/data/en/stats.ndjson"),
          "utf8",
        )
        .split("\n")
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { ref: string }).ref),
    );
    const combos = Object.values(TABLET_COMBOS).flat();
    expect(combos.length).toBeGreaterThan(0);
    expect(
      combos.flatMap((combo) => combo.refs).filter((ref) => !refs.has(ref)),
    ).toEqual([]);
    for (const combo of combos) {
      expect(["measured", "model only"]).toContain(combo.source);
      expect(combo.div).toBeGreaterThan(0);
      expect(combo.asOf).toBe("2026-11-24");
    }
  });

  it("prices Depths with Desecrated currency at about 3 div", () => {
    const verdict = rateTablet("Abyss Tablet", "Rare", [
      mod(GOLD, 35),
      mod(DEPTHS, 15),
      mod(DESECRATED, 29),
    ])!;
    expect(verdict.level).toBe("money");
    expect(verdict.text).toBe(
      "Always money: Abyssal Depths · Depths + Desecrated: ~3 div (asks, 2026-11-24)",
    );
    // Depths alone matches too; the dearer set comes first.
    expect(verdict.combos.map((c) => [c.short, c.div, c.source])).toEqual([
      ["Depths + Desecrated", 3, "measured"],
      ["Depths chance", 0.6, "measured"],
    ]);
  });

  it("prices rare monsters, Desecrated and Abyss rares at about 2 div", () => {
    const verdict = rateTablet("Abyss Tablet", "Rare", [
      mod(RARES, 27),
      mod(DESECRATED, 27),
      mod(ABYSS_RARES, 3),
    ])!;
    expect(verdict.level).toBe("combo");
    expect(verdict.text).toBe(
      "Well rolled: Rare monsters + Desecrated currency + Abyss rares · Rare monsters + Desecrated + Abyss rares: ~2 div (asks, 2026-11-24)",
    );
    expect(verdict.combos[0].div).toBe(2);
  });

  it("marks the Desecrated and Pit rewards price as model only", () => {
    const verdict = rateTablet("Abyss Tablet", "Rare", [
      mod(PIT_REWARDS),
      mod(DESECRATED, 25),
    ])!;
    expect(verdict.text).toBe(
      "Well rolled: Pit rewards + Desecrated currency · Desecrated + Pit rewards: ~1.5 div (model only, 2026-11-24)",
    );
    expect(verdict.combos[0].source).toBe("model only");
  });

  it("prices Depths alone at about 0.6 div", () => {
    expect(rateTablet("Abyss Tablet", "Rare", [mod(DEPTHS, 12)])!.text).toBe(
      "Always money: Abyssal Depths · Depths chance: ~0.6 div (asks, 2026-11-24)",
    );
  });

  it("needs every mod of a combination", () => {
    const verdict = rateTablet("Abyss Tablet", "Rare", [
      mod(RARES, 27),
      mod(DESECRATED, 27),
    ])!;
    expect(verdict.combos).toEqual([]);
    expect(verdict.text).toBe(
      "Well rolled: Rare monsters + Desecrated currency",
    );
  });

  it("prices only the rarity the asks were read on", () => {
    // Every probe searched rare tablets; a magic one is not priced.
    const verdict = rateTablet("Abyss Tablet", "Magic", [mod(DEPTHS, 20)])!;
    expect(verdict.combos).toEqual([]);
    expect(verdict.text).toBe("Always money: Abyssal Depths");
    expect(
      rateTablet("Ritual Tablet", "Rare", [mod(DEPTHS, 20)])!.combos,
    ).toEqual([]);
  });
});

// T-8: the 2026-11-24 market studies of the other six bases
// (research/tablets/market-2026-11-24.md), real-currency asks on rare tablets.
describe("measured sets on the other bases", () => {
  const REMNANT =
    "Expeditions have #% Surpassing chance to contain an additional Verisium Remnant";
  const RANDOM = "Map has # additional random Modifier";
  const REROLL_COST =
    "Rerolling Favours at Ritual Altars in Map costs #% increased Tribute";
  const DEFER_COST =
    "Deferring Favours at Ritual Altars in Map costs #% increased Tribute";
  const MIRRORS = "Delirium Fog in Map spawns #% increased Fracturing Mirrors";
  const SHARDS = "Delirium Fog in Map spawns #% increased Mirror Shards";
  const HIVEBLOOD = "#% increased Quantity of Hiveblood found in Map";
  const WOMBGIFTS = "#% increased Quantity of Wombgifts found in Map";
  const SPIRITS = "Map contains # additional Azmeri Spirit";
  const STRONGBOXES = "Map contains # additional Strongboxes";
  const CRYSTAL =
    "#% chance to gain an additional Crystal from Vaal Beacons in Map";

  it("carries every set of the six studies, priced in divines", () => {
    const divs = (base: string) =>
      (TABLET_COMBOS[base] ?? []).map((combo) => combo.div);
    expect(divs("Ritual Tablet")).toEqual([55, 1, 0.17, 11, 0.2]);
    expect(divs("Expedition Tablet")).toEqual([200, 20, 3, 2, 0.12, 1]);
    expect(divs("Delirium Tablet")).toEqual([2, 1.6]);
    expect(divs("Breach Tablet")).toEqual([6, 2, 1, 0.3, 0.25]);
    expect(divs("Overseer Tablet")).toEqual([60, 9, 5, 1]);
    expect(divs("Temple Tablet")).toEqual([13, 12, 4]);
    expect(divs("Irradiated Tablet")).toEqual([2.3, 1]);
    for (const combo of Object.values(TABLET_COMBOS).flat()) {
      expect(combo.rarity).toBe("Rare");
      if (combo.source === "measured") expect(combo.basis).toMatch(/listed/);
    }
  });

  it("prices Ritual rerolls with omen chance at about 55 div", () => {
    const verdict = rateTablet("Ritual Tablet", "Rare", [
      mod(REROLLS, 2),
      mod(OMENS, 60),
    ])!;
    expect(verdict.text).toBe(
      "Always money: Favour rerolls, Omen chance · Favour rerolls + Omen chance: ~55 div (asks, 2026-11-24)",
    );
    // Each mod alone is a set too; the dearer come first.
    expect(verdict.combos.map((c) => c.div)).toEqual([55, 11, 0.2]);
  });

  it("prices a pair of multipliers that sells only as a pair", () => {
    expect(
      rateTablet("Ritual Tablet", "Rare", [
        mod(REROLL_COST, -25),
        mod(DEFER_COST, -25),
      ])!.text,
    ).toBe(
      "Multiplier only: 2 multipliers · Cheaper rerolls + Cheaper deferring: ~0.17 div (asks, 2026-11-24)",
    );
  });

  it("prices the Expedition Remnant with random map mods at about 200 div", () => {
    const verdict = rateTablet("Expedition Tablet", "Rare", [
      mod(REMNANT, 35),
      mod(RANDOM, 1),
    ])!;
    expect(verdict.text).toBe(
      "Always money: Extra Remnant, Random map mods · Extra Remnant + Random map mods: ~200 div (asks, 2026-11-24)",
    );
    expect(verdict.combos.map((c) => c.div)).toEqual([200, 2, 1]);
  });

  it("prices a pair of good mods on Delirium and Breach", () => {
    expect(
      rateTablet("Delirium Tablet", "Rare", [
        mod(MIRRORS, 20),
        mod(SHARDS, 20),
      ])!.text,
    ).toBe(
      "Well rolled: Fracturing Mirrors + Mirror Shards · Fracturing Mirrors + Mirror Shards: ~2 div (asks, 2026-11-24)",
    );
    expect(
      rateTablet("Breach Tablet", "Rare", [
        mod(HIVEBLOOD, 40),
        mod(WOMBGIFTS, 40),
      ])!.combos.map((c) => [c.short, c.div]),
    ).toEqual([
      ["Hiveblood + Wombgifts", 6],
      ["Wombgifts", 0.25],
    ]);
  });

  it("says the Overseer spirit and strongbox set shares the generic prefixes' lines", () => {
    const [combo] = rateTablet("Overseer Tablet", "Rare", [
      mod(SPIRITS, 2),
      mod(STRONGBOXES, 2),
    ])!.combos;
    expect([combo.short, combo.div]).toEqual([
      "Azmeri Spirits + Strongboxes",
      60,
    ]);
    expect(combo.basis).toContain("generic");
  });

  it("puts Temple's unique monster mod alone above its pair with the crystal", () => {
    const verdict = rateTablet("Temple Tablet", "Rare", [
      mod(CRYSTAL, 8),
      mod(UNIQUE_RARE_MOD, 1),
    ])!;
    expect(verdict.combos.map((c) => [c.short, c.div])).toEqual([
      ["Unique monster rare mod", 13],
      ["Extra Crystal + Unique monster rare mod", 12],
      ["Extra Crystal", 4],
    ]);
  });

  it("prices random map mods by base", () => {
    const random = (base: string) =>
      rateTablet(base, "Rare", [mod(RANDOM, 1)])!.combos.map((c) => c.div);
    expect(random("Irradiated Tablet")).toEqual([2.3]);
    expect(random("Expedition Tablet")).toEqual([2]);
    expect(random("Overseer Tablet")).toEqual([1]);
    // Temple and Delirium: about the rare floor, no set.
    expect(random("Temple Tablet")).toEqual([]);
    expect(random("Delirium Tablet")).toEqual([]);
  });
});
