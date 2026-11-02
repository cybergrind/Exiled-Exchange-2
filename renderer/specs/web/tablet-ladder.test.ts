import { describe, expect, it } from "vitest";
import {
  tabletKey,
  tabletLadderItems,
  TABLET_CATEGORY,
} from "@/web/price-check/ladder/tablets.ts";
import { buildLadder } from "@/web/price-check/ladder/ladder.ts";
import { TABLE } from "./ladder-fixture";

// poe.ninja prices a non-unique tablet per base and rarity (PrecursorTablets)
// and each unique tablet by name (UniqueTablets); the ladder ranks them all.
const BASES = [
  { name: "Ritual Tablet", variant: "Normal", primaryValue: 0.4338 },
  {
    name: "Ritual Tablet",
    variant: "Magic",
    primaryValue: 0.2244,
    totalChange: 54.44,
  },
  { name: "Delirium Tablet", variant: "Rare", primaryValue: 0.01496 },
];
const UNIQUES = [
  { name: "Freedom of Faith", variant: "Ritual Tablet", primaryValue: 0.2342 },
];
const icon = (ns: string, name: string) => `${ns}/${name}.png`;

describe("tablet ladder", () => {
  it("keys a base tablet by its rarity and a unique by its name", () => {
    expect(
      tabletKey({ ns: "ITEM", name: "Ritual Tablet", variant: "Magic" }),
    ).toBe("Ritual Tablet (Magic)");
    expect(
      tabletKey({
        ns: "UNIQUE",
        name: "Freedom of Faith",
        variant: "Ritual Tablet",
      }),
    ).toBe("Freedom of Faith");
  });

  it("lists every base by rarity and every unique tablet", () => {
    const items = tabletLadderItems(BASES, UNIQUES, icon);
    expect(items.map((i) => [i.name, i.label, i.ns, i.icon])).toEqual([
      [
        "Ritual Tablet (Normal)",
        "Ritual · Normal",
        "ITEM",
        "ITEM/Ritual Tablet.png",
      ],
      [
        "Ritual Tablet (Magic)",
        "Ritual · Magic",
        "ITEM",
        "ITEM/Ritual Tablet.png",
      ],
      [
        "Delirium Tablet (Rare)",
        "Delirium · Rare",
        "ITEM",
        "ITEM/Delirium Tablet.png",
      ],
      [
        "Freedom of Faith",
        "Freedom of Faith",
        "UNIQUE",
        "UNIQUE/Freedom of Faith.png",
      ],
    ]);
    expect(items[1].ninja).toEqual({
      primaryValue: 0.2244,
      totalChange: 54.44,
    });
    expect(TABLET_CATEGORY).toBe("Tablets");
  });

  it("ranks them by value, with the given labels", () => {
    const ladder = buildLadder({
      items: tabletLadderItems(BASES, UNIQUES, icon),
      table: TABLE,
      core: "exalted",
      checked: "Ritual Tablet (Magic)",
    });
    expect(ladder.rows.map((r) => r.label)).toEqual([
      "Ritual · Normal",
      "Freedom of Faith",
      "Ritual · Magic",
      "Delirium · Rare",
    ]);
    expect(ladder.rank).toBe(3);
  });
});
