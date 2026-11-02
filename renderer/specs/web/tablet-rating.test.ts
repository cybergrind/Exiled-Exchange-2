import { describe, expect, it } from "vitest";
import {
  rateTablet,
  TABLET_RATINGS,
  tabletModRating,
  UNPARSED_REFS,
  unparsedRef,
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
    expect(tabletModRating("Ritual Tablet", OMENS)?.tier).toBe("good");
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
    expect(rated[0].tier).toBe("good");
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
      .filter((ref) => !refs.has(ref) && !UNPARSED_REFS.includes(ref));
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
    expect(verdict.text).toBe("Always money: Favour rerolls");
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
    // The Rare Overseer Tablet from the screenshot.
    const verdict = rateTablet("Overseer Tablet", "Rare", [
      mod("Monsters have #% increased Effectiveness", 11),
      mod("Map has #% increased Monster Rarity", 19),
      mod("#% increased Quantity of Waystones dropped by Map Bosses", 24),
      mod("#% increased Quantity of Waystones found in Map", 30),
    ])!;
    expect(verdict.level).toBe("combo");
    expect(verdict.text).toBe("Well rolled: Boss waystones + 3 multipliers");
    expect(
      rateTablet("Abyss Tablet", "Magic", [
        mod(RARITY, 10),
        mod("Map has #% increased Monster Rarity", 19),
      ])!.text,
    ).toBe("Multiplier only: 2 multipliers");
  });

  it("rates one good mod as good", () => {
    const verdict = rateTablet("Ritual Tablet", "Magic", [mod(OMENS, 50)])!;
    expect(verdict.level).toBe("good");
    expect(verdict.text).toBe("Good mod: Omen chance");
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
        "Abyss Tablet",
        "Map is inhabited by # additional Rogue Exile",
      ),
    ).toBeUndefined();
  });

  it("rates the Expedition Remnant mod from its unparsed text", () => {
    const ref = unparsedRef(
      "Expeditions have +35% Surpassing chance to contain an additional Verisium Remnant",
    );
    expect(UNPARSED_REFS).toContain(ref);
    const verdict = rateTablet("Expedition Tablet", "Rare", [mod(ref)])!;
    expect(verdict.text).toBe("Always money: Extra Remnant");
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
