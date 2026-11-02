/**
 * WP-53 / F11: poe.ninja unique lines whose names were missing from the
 * English item database. Expected bases are the official trade list
 * (GET https://www.pathofexile.com/api/trade2/data/items, 2026-11-02) and
 * agree with poe.ninja's stash overview `baseType` for Forbidden Rites.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import {
  init,
  ITEM_BY_REF,
  ITEMS_ITERATOR,
  UNIQUE_NS_NAMES,
} from "@/assets/data";
import { parseClipboard } from "@/parser";
import { getDetailsId } from "@/web/price-check/trends/getDetailsId";

const MISSING: Array<[string, string[]]> = [
  ["Eshtera's Path", ["Ring"]],
  ["Safrin's Resolve", ["Ring"]],
  ["Zaida's Longevity", ["Ring"]],
  ["Byrnabas", ["Wide Belt"]],
  ["Reverie", ["Shaman Mantle", "Runemastered Shaman Mantle"]],
  ["Splinter of Lorrata", ["Hardwood Spear", "Runeforged Hardwood Spear"]],
];

describe("uniques missing from the English item data (F11)", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it.each(MISSING)("%s resolves through ITEM_BY_REF", (name, bases) => {
    const found = ITEM_BY_REF("UNIQUE", name);
    expect(found?.length).toBe(bases.length);
    for (const info of found!) {
      expect(info.namespace).toBe("UNIQUE");
      expect(info.refName).toBe(name);
      expect(info.name).toBe(name);
      expect(info.icon).toMatch(/^https:\/\/web\.poecdn\.com\/gen\/image\//);
    }
    expect(found!.map((info) => info.unique!.base).sort()).toEqual(
      [...bases].sort(),
    );
  });

  it.each(MISSING)(
    "%s has bases the parser can derive a category from",
    (name) => {
      for (const info of ITEM_BY_REF("UNIQUE", name)!) {
        const base = ITEM_BY_REF("ITEM", info.unique!.base);
        expect(base?.[0].craftable?.category).toBeTruthy();
        expect(info.w).toBe(base![0].w);
        expect(info.h).toBe(base![0].h);
      }
    },
  );

  // items.ndjson carries these as nameless rows (no name, no refName,
  // %NOT_FOUND% icon): the generator could not name them.
  it("offers the new rings, and no nameless row, for an unidentified Ring", () => {
    const names = new Set<string | undefined>();
    for (const match of ITEMS_ITERATOR(JSON.stringify("Ring"))) {
      if (match.namespace === "UNIQUE" && match.unique!.base === "Ring") {
        names.add(match.refName);
      }
    }
    expect(names).toEqual(
      new Set([
        "Kalandra's Touch",
        "Eshtera's Path",
        "Safrin's Resolve",
        "Zaida's Longevity",
      ]),
    );
  });

  // One entry per row, as for every unique: Reverie has two bases.
  it("lists the new names, and no 'undefined', for unique search", () => {
    const names = Array.from(UNIQUE_NS_NAMES());
    expect(names).not.toContain("undefined");
    for (const [name, bases] of MISSING) {
      expect(names.filter((n) => n === name)).toHaveLength(bases.length);
    }
  });

  it("fills an icon the item data lacks, keeping the rest of the record", () => {
    // items.ndjson has "%NOT_FOUND%" for the Expedition Tablet base.
    const [tablet] = ITEM_BY_REF("ITEM", "Expedition Tablet")!;
    expect(tablet.icon).toMatch(/PrecursorTabletExpedition\.png$/);
    expect(tablet.craftable).toEqual({ category: "TowerAugment" });
    expect(
      [...ITEMS_ITERATOR('"Expedition Tablet"')].filter(
        (item) => item.refName === "Expedition Tablet",
      ),
    ).toHaveLength(1);
  });

  it("leaves existing records alone", () => {
    expect(ITEM_BY_REF("UNIQUE", "Brynabas")?.[0].name).toBe("Byrnabas");
    expect(ITEM_BY_REF("UNIQUE", "Andvarius")?.[0].unique?.base).toBe(
      "Gold Ring",
    );
  });
});

// Minimal clipboard texts: header, base and item level only. Synthetic, not a
// recorded item; no real copy of these uniques was available (in-game check
// unverified).
describe("price-check id for the F11 uniques", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it.each([
    ["Rings", "Eshtera's Path", "Ring"],
    ["Rings", "Safrin's Resolve", "Ring"],
    ["Rings", "Zaida's Longevity", "Ring"],
    ["Belts", "Byrnabas", "Wide Belt"],
    ["Body Armours", "Reverie", "Shaman Mantle"],
    ["Body Armours", "Reverie", "Runemastered Shaman Mantle"],
    ["Spears", "Splinter of Lorrata", "Hardwood Spear"],
    ["Spears", "Splinter of Lorrata", "Runeforged Hardwood Spear"],
  ])("%s: %s on %s", (itemClass, name, base) => {
    const text = [
      `Item Class: ${itemClass}`,
      "Rarity: Unique",
      name,
      base,
      "--------",
      "Item Level: 80",
      "",
    ].join("\n");
    const item = parseClipboard(text)._unsafeUnwrap();
    expect(item.info.icon).not.toBe("%NOT_FOUND%");
    expect(getDetailsId(item)).toEqual({
      ns: "UNIQUE",
      name,
      variant: base,
    });
  });
});
