import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  confidence,
  HIGH_CONFIDENCE_LISTINGS,
  MEDIUM_CONFIDENCE_LISTINGS,
  mergeUniqueLines,
  parseUniqueOverview,
  STASH_TYPES,
  stripMarkup,
  tabletLine,
  UNIQUE_TYPES,
  uniqueKind,
  uniqueLine,
  uniqueOverviewUrl,
  uniqueVariants,
} from "@/web/background/market/uniques.ts";
import type {
  UniqueLine,
  UniqueVariant,
} from "@/web/background/market/uniques.ts";
import {
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
} from "@/web/background/market/snapshot.ts";
import type { Snapshot } from "@/web/background/market/snapshot.ts";
import { fixture } from "./prices-harness";

// Recorded poe.ninja stash overviews (specs/fixtures/market/SOURCES.md).
const weaponsBody = () => JSON.parse(fixture("stash-unique-weapons.json"));
const armoursBody = () => JSON.parse(fixture("stash-unique-armours.json"));
const rathpithBody = () =>
  JSON.parse(fixture("stash-unique-armours-rathpith.json"));
// A 200 with no lines (exchange endpoint, same envelope) and the stash
// endpoint's answer to a wrong type (404 with a problem body).
const emptyBody = () => JSON.parse(fixture("exchange-empty-type.json"));
const wrongTypeBody = () => JSON.parse(fixture("stash-wrong-type.json"));

const weapons = () => parseUniqueOverview("UniqueWeapons", weaponsBody())!;
const armours = () => parseUniqueOverview("UniqueArmours", armoursBody())!;
const rathpith = () => parseUniqueOverview("UniqueArmours", rathpithBody())!;
const all = () => [...weapons(), ...armours(), ...rathpith()];

function find(lines: UniqueLine[], name: string, baseType: string) {
  const line = lines.find((l) => l.name === name && l.baseType === baseType);
  if (!line) throw new Error(`fixture has no ${name} ${baseType}`);
  return line;
}

function variant(variants: UniqueVariant[], baseType: string) {
  const v = variants.find((x) => x.line.baseType === baseType);
  if (!v) throw new Error(`no variant ${baseType}`);
  return v;
}

describe("UNIQUE_TYPES", () => {
  it("lists the eight unique stash types, not PrecursorTablets", () => {
    expect(UNIQUE_TYPES).toEqual([
      "UniqueWeapons",
      "UniqueArmours",
      "UniqueAccessories",
      "UniqueFlasks",
      "UniqueCharms",
      "UniqueJewels",
      "UniqueSanctumRelics",
      "UniqueTablets",
    ]);
  });

  it("builds the stash overview URL", () => {
    expect(uniqueOverviewUrl("Forbidden Rites", "UniqueWeapons")).toBe(
      "https://poe.ninja/poe2/api/economy/stash/current/item/overview?league=Forbidden+Rites&type=UniqueWeapons",
    );
  });
});

// Non-unique tablets: poe.ninja prices each base by rarity, with listings.
const tabletsBody = () => JSON.parse(fixture("stash-precursor-tablets.json"));

describe("tablet lines", () => {
  it("fetches PrecursorTablets after the unique types", () => {
    expect(STASH_TYPES).toEqual([...UNIQUE_TYPES, "PrecursorTablets"]);
  });

  it("keeps a tablet line's rarity", () => {
    const lines = parseUniqueOverview("PrecursorTablets", tabletsBody())!;
    expect(lines).toHaveLength(24);
    const magic = tabletLine(lines, "Ritual Tablet", "Magic")!;
    expect(magic.variant).toBe("Magic");
    expect(magic.primaryValue).toBe(0.2244);
    expect(magic.listingCount).toBe(10000);
    expect(tabletLine(lines, "Overseer Tablet", "Normal")!.listingCount).toBe(
      3,
    );
    expect(tabletLine(lines, "Ritual Tablet", "Unique")).toBeUndefined();
  });

  it("merges tablets beside the uniques, which ignore them", () => {
    const lines = mergeUniqueLines([], {
      UniqueWeapons: weaponsBody(),
      PrecursorTablets: tabletsBody(),
    });
    expect(lines.filter((l) => l.type === "PrecursorTablets")).toHaveLength(24);
    expect(uniqueLine(lines, "Ritual Tablet", "Ritual Tablet")).toBeUndefined();
    expect(uniqueVariants(lines, "Ritual Tablet")).toEqual([]);
    expect(tabletLine(lines, "Tidebreaker", "Pointed Maul")).toBeUndefined();
  });
});

describe("stripMarkup", () => {
  it.each([
    [
      "+(100-150) to maximum [EnergyShield|Energy Shield]",
      "+(100-150) to maximum Energy Shield",
    ],
    [
      "(80-120)% increased [Physical] Damage",
      "(80-120)% increased Physical Damage",
    ],
    [
      "+(10-20)% to all [ElementalDamage|Elemental] [Resistances]",
      "+(10-20)% to all Elemental Resistances",
    ],
    ["[Mace|Two Hand Mace]", "Two Hand Mace"],
    ["Body Armour", "Body Armour"],
  ])("%s -> %s", (text, expected) => {
    expect(stripMarkup(text)).toBe(expected);
  });
});

describe("uniqueKind", () => {
  it("reads the base-type prefix", () => {
    expect(uniqueKind("Runeforged Pointed Maul")).toBe("Runeforged");
    expect(uniqueKind("Runemastered Silk Robe")).toBe("Runemastered");
    expect(uniqueKind("Pointed Maul")).toBe("regular");
    expect(uniqueKind("Runic Fork")).toBe("regular");
  });
});

describe("parseUniqueOverview", () => {
  it("parses sparkLine with its capital L", () => {
    const line = find(weapons(), "Tidebreaker", "Runeforged Pointed Maul");
    expect(line.sparkLine).toEqual({
      totalChange: -42.68,
      data: [0, null, -10.93, 0.25, -39.55, null, -42.68],
    });
  });

  it("keeps only the fields the app needs", () => {
    const line = find(weapons(), "Tidebreaker", "Runeforged Pointed Maul");
    expect(line).toEqual({
      type: "UniqueWeapons",
      name: "Tidebreaker",
      baseType: "Runeforged Pointed Maul",
      kind: "Runeforged",
      category: "Two Hand Mace",
      primaryValue: 0.5663,
      listingCount: 30,
      sparkLine: line.sparkLine,
      icon: expect.stringMatching(/^https:\/\/web\.poecdn\.com\//),
      detailsId: "tidebreaker-runeforged-pointed-maul",
    });
  });

  it("parses every line of a recorded overview", () => {
    expect(weapons()).toHaveLength(6);
    expect(armours()).toHaveLength(4);
    expect(
      find(armours(), "Svalinn", "Runemastered Crucible Tower Shield").kind,
    ).toBe("Runemastered");
  });

  it("strips mod markup when mods are asked for", () => {
    const lines = parseUniqueOverview("UniqueArmours", armoursBody(), {
      mods: true,
    })!;
    const mods = find(lines, "Temporalis", "Silk Robe").mods!;
    expect(mods).toContain("+(100-150) to maximum Energy Shield");
    expect(mods).toContain("+(10-20)% to all Elemental Resistances");
    expect(mods.join("\n")).not.toMatch(/[[\]|]/);
  });

  it("leaves mods out by default", () => {
    expect(find(armours(), "Temporalis", "Silk Robe")).not.toHaveProperty(
      "mods",
    );
  });

  it("returns null for a response with no lines", () => {
    expect(parseUniqueOverview("UniqueWeapons", emptyBody())).toBeNull();
  });

  it("returns null for a wrong type's 404 body and for non-objects", () => {
    expect(parseUniqueOverview("UniqueWeapons", wrongTypeBody())).toBeNull();
    expect(parseUniqueOverview("UniqueWeapons", null)).toBeNull();
    expect(parseUniqueOverview("UniqueWeapons", "<html>")).toBeNull();
  });

  it("returns null when prices are not in divines", () => {
    const body = weaponsBody();
    body.core.primary = "chaos";
    expect(parseUniqueOverview("UniqueWeapons", body)).toBeNull();
  });

  it("skips a line without a name or a price", () => {
    const body = weaponsBody();
    delete body.lines[0].name;
    body.lines[1].primaryValue = "1";
    expect(parseUniqueOverview("UniqueWeapons", body)).toHaveLength(4);
  });
});

describe("mergeUniqueLines", () => {
  const start = () =>
    mergeUniqueLines([], {
      UniqueWeapons: weaponsBody(),
      UniqueArmours: armoursBody(),
    });

  it("collects the lines of every type answered", () => {
    expect(start()).toHaveLength(10);
  });

  it("an empty response does not replace the last good lines", () => {
    const merged = mergeUniqueLines(start(), { UniqueWeapons: emptyBody() });
    expect(merged).toEqual(start());
  });

  it("a wrong-type 404 or a failed fetch keeps the last good lines", () => {
    const merged = mergeUniqueLines(start(), {
      UniqueWeapons: wrongTypeBody(),
      UniqueArmours: undefined,
    });
    expect(merged).toEqual(start());
  });

  it("a good response replaces only its own type's lines", () => {
    const merged = mergeUniqueLines(start(), {
      UniqueArmours: rathpithBody(),
    });
    expect(merged.filter((l) => l.type === "UniqueWeapons")).toEqual(weapons());
    expect(merged.filter((l) => l.type === "UniqueArmours")).toEqual(
      rathpith(),
    );
  });
});

describe("confidence", () => {
  it("uses D7's thresholds", () => {
    expect(MEDIUM_CONFIDENCE_LISTINGS).toBe(5);
    expect(HIGH_CONFIDENCE_LISTINGS).toBe(20);
  });

  it.each([
    [0, "low"],
    [1, "low"],
    [4, "low"],
    [5, "medium"],
    [19, "medium"],
    [20, "high"],
    [10000, "high"],
  ])("%i listings is %s", (listings, level) => {
    expect(confidence(listings)).toBe(level);
  });

  it("Winter's Bite is low confidence", () => {
    const line = find(weapons(), "Winter's Bite", "Glass Shank");
    expect(line.listingCount).toBe(1);
    expect(confidence(line.listingCount)).toBe("low");
    const [only] = uniqueVariants(weapons(), "Winter's Bite");
    expect(only.confidence).toBe("low");
  });
});

describe("uniqueLine", () => {
  it("finds a line by name and base type", () => {
    expect(
      uniqueLine(all(), "Svalinn", "Crucible Tower Shield")?.primaryValue,
    ).toBe(2);
    expect(uniqueLine(all(), "Svalinn", "Silk Robe")).toBeUndefined();
  });
});

describe("uniqueVariants", () => {
  it("Tidebreaker has a Runeforged multiple", () => {
    const variants = uniqueVariants(all(), "Tidebreaker");
    expect(variants.map((v) => v.line.baseType)).toEqual([
      "Pointed Maul",
      "Runeforged Pointed Maul",
    ]);
    const forged = variant(variants, "Runeforged Pointed Maul");
    expect(forged.regular?.baseType).toBe("Pointed Maul");
    expect(forged.multiple).toBeCloseTo(0.5663 / 0.00143, 6);
    expect(forged.confidence).toBe("high");
    expect(forged.multipleConfidence).toBe("high");
  });

  it("gives the regular version no multiple", () => {
    const regular = variant(
      uniqueVariants(all(), "Tidebreaker"),
      "Pointed Maul",
    );
    expect(regular.regular).toBeNull();
    expect(regular.multiple).toBeNull();
  });

  it("Svalinn's Runemastered multiple is below 1", () => {
    const mastered = variant(
      uniqueVariants(all(), "Svalinn"),
      "Runemastered Crucible Tower Shield",
    );
    expect(mastered.multiple).toBeCloseTo(0.2989 / 2.0, 6);
    expect(mastered.multiple!).toBeLessThan(1);
  });

  it("a 1-listing side gives no multiple", () => {
    const variants = uniqueVariants(all(), "Brynhand's Mark");
    const mastered = variant(variants, "Runemastered Wooden Club");
    expect(mastered.line.listingCount).toBe(1);
    expect(mastered.regular?.baseType).toBe("Wooden Club");
    expect(mastered.confidence).toBe("low");
    expect(mastered.multiple).toBeNull();
    expect(mastered.multipleConfidence).toBe("low");
    // The Runeforged one beside it is liquid and keeps its multiple.
    const forged = variant(variants, "Runeforged Wooden Club");
    expect(forged.multiple).toBeCloseTo(0.00143 / 0.0043, 6);
  });

  it("orders regular, Runeforged, Runemastered", () => {
    expect(
      uniqueVariants(all(), "Brynhand's Mark").map((v) => v.line.kind),
    ).toEqual(["regular", "Runeforged", "Runemastered"]);
  });

  it("matches a rune variant on another base to the only regular version", () => {
    // Rathpith Globe is a Sacred Focus; its Runemastered line is a Plumed Focus.
    const mastered = variant(
      uniqueVariants(all(), "Rathpith Globe"),
      "Runemastered Plumed Focus",
    );
    expect(mastered.regular?.baseType).toBe("Sacred Focus");
    expect(mastered.confidence).toBe("medium");
    expect(mastered.multiple).toBeCloseTo(19.5 / 6.74, 6);
    expect(mastered.multipleConfidence).toBe("medium");
  });

  it("returns nothing for an unknown name", () => {
    expect(uniqueVariants(all(), "Not A Unique")).toEqual([]);
  });
});

describe("snapshot uniques block", () => {
  const base = (): Snapshot => ({
    schemaVersion: SNAPSHOT_VERSION,
    league: "Forbidden Rites",
    writtenAt: "2026-11-02T15:00:00.000Z",
    cx: null,
    relay: null,
  });

  it("round-trips unique lines", () => {
    const snapshot: Snapshot = {
      ...base(),
      uniques: { fetchedAt: "2026-11-02T14:53:00.000Z", lines: all() },
    };
    expect(parseSnapshot(serializeSnapshot(snapshot))).toEqual(snapshot);
  });

  it("still reads a snapshot without uniques", () => {
    expect(parseSnapshot(serializeSnapshot(base())).uniques).toBeUndefined();
  });

  it("rejects a malformed uniques block", () => {
    const bad = (uniques: unknown) =>
      parseSnapshot(JSON.stringify({ ...base(), uniques }));
    expect(() => bad({ fetchedAt: 1, lines: [] })).toThrow(/uniques/);
    expect(() => bad({ fetchedAt: "x", lines: {} })).toThrow(/uniques/);
    expect(() =>
      bad({ fetchedAt: "2026-11-02T14:53:00.000Z", lines: [{ name: 1 }] }),
    ).toThrow(/uniques/);
  });
});

describe("uniques.ts", () => {
  it("has no runtime imports, so main can bundle it", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../src/web/background/market/uniques.ts"),
      "utf8",
    );
    const imports = source.match(/^import .*$/gm) ?? [];
    for (const line of imports) expect(line).toMatch(/^import type /);
  });
});
