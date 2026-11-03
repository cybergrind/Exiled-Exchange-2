import { describe, expect, it } from "vitest";
import { applyTabletKeyMods } from "@/web/price-check/tablets/tabletSearch";
import { FilterTag } from "@/web/price-check/filters/interfaces";
import type { StatFilter } from "@/web/price-check/filters/interfaces";

// Search on what sets a tablet's price: its rated mods and uses remaining.
function filter(statRef: string, tag = FilterTag.Explicit): StatFilter {
  return {
    tradeId: ["explicit.stat_1"],
    statRef,
    text: statRef,
    tag,
    sources: [],
    disabled: false,
  };
}

const USES = "# uses remaining";
const OMENS = "Ritual Favours in Map have #% increased chance to be Omens";
const RARITY = "#% increased Rarity of Items found";
const EXPERIENCE = "#% increased Experience gain";
const UNIQUE_RARE_MOD = "Unique Monsters have # additional Rare Modifier";
const GOLD = "#% increased Gold found in Map";

const enabled = (filters: StatFilter[]) =>
  filters.filter((f) => !f.disabled).map((f) => f.statRef);

describe("applyTabletKeyMods", () => {
  it("keeps rated mods and uses remaining, unticks the rest", () => {
    const filters = [
      filter(USES, FilterTag.Pseudo),
      filter(OMENS),
      filter(RARITY),
      filter(EXPERIENCE),
      filter(GOLD),
    ];
    applyTabletKeyMods(filters, "Ritual Tablet", "Rare");
    expect(enabled(filters)).toEqual([USES, OMENS, RARITY]);
    expect(filters.every((f) => f.hidden === undefined)).toBe(true);
  });

  it("searches on niche mods when the tablet has nothing better", () => {
    const filters = [
      filter(USES, FilterTag.Pseudo),
      filter(EXPERIENCE),
      filter(UNIQUE_RARE_MOD),
    ];
    applyTabletKeyMods(filters, "Ritual Tablet", "Magic");
    expect(enabled(filters)).toEqual([USES, EXPERIENCE]);
  });

  it("compares a tablet without valued mods on uses alone", () => {
    const filters = [filter(USES, FilterTag.Pseudo), filter(GOLD)];
    applyTabletKeyMods(filters, "Ritual Tablet", "Magic");
    expect(enabled(filters)).toEqual([USES]);
  });

  it("leaves normal and unique tablets alone", () => {
    for (const rarity of ["Normal", "Unique"]) {
      const filters = [filter(GOLD)];
      applyTabletKeyMods(filters, "Ritual Tablet", rarity);
      expect(enabled(filters)).toEqual([GOLD]);
    }
  });
});
