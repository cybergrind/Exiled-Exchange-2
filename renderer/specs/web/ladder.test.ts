import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  buildLadder,
  LADDER_CATEGORIES,
  shortNames,
  type LadderItem,
} from "@/web/price-check/ladder/ladder.ts";
import { fixture } from "./market/prices-harness";
import { quoteRate } from "@/web/background/market/exchangeValue.ts";
import { THIN_TRADED } from "@/web/background/market/constants.ts";
import { categoryItems, OVERVIEW, TABLE } from "./ladder-fixture";

// WP-40, over recorded market state (./ladder-fixture.ts).
const OMENS = categoryItems("Ritual");
const DIV_EX = quoteRate(TABLE, "divine", "exalted")!;

function omens(checked: string, items = OMENS) {
  return buildLadder({ items, table: TABLE, core: "exalted", checked });
}

describe("buildLadder over the Ritual (omens) category", () => {
  it("ranks every line, descending by ordering value", () => {
    const ladder = omens("Omen of Light");
    expect(ladder.total).toBe(38);
    expect(ladder.rows).toHaveLength(38);
    const orderings = ladder.rows.map((r) => r.ordering!);
    expect(orderings).toEqual([...orderings].sort((a, b) => b - a));
    expect(ladder.rows.map((r) => r.rank)).toEqual(
      ladder.rows.map((_, i) => i + 1),
    );
    expect(ladder.rows[0].name).toBe("Omen of Sinistral Annulment");
    expect(ladder.rows.at(-1)!.name).toBe("Omen of the Liege");
  });

  it("puts the checked item at its rank", () => {
    // 24.15, 23.43, 16.83, 16.13, 15.91 div sit above Omen of Light (12.16).
    const ladder = omens("Omen of Light");
    expect(ladder.rank).toBe(6);
    expect(ladder.rows[5].name).toBe("Omen of Light");
    expect(ladder.rows[5].checked).toBe(true);
    expect(ladder.rows.filter((r) => r.checked)).toHaveLength(1);
  });

  it("shows the display value and orders by the converted value", () => {
    const ladder = omens("Omen of Light");
    const light = ladder.rows[5];
    // No GGG pair in the trimmed feed: poe.ninja, converted, marked (rule 3).
    expect(light.value!.rule).toBe(3);
    expect(light.estimate).toBe(true);
    expect(light.ordering).toBeCloseTo(12.16 * DIV_EX, 6);
    expect(light.change).toBe(24.35);

    // Omen of Bartering trades on the feed: its own pair is shown, unconverted.
    const bartering = ladder.rows.find((r) => r.name === "Omen of Bartering")!;
    expect(bartering.value!.source).toBe("ggg");
    expect(bartering.estimate).toBe(false);
    expect(bartering.value!.value).toBe(
      OMENS.find((i) => i.name === "Omen of Bartering")!.pairs![
        bartering.value!.currency
      ]!.typical,
    );
    expect(bartering.thin).toBe(bartering.value!.traded! < THIN_TRADED);
  });

  it("windows 5 above and 5 below the checked item", () => {
    const ladder = omens("Omen of Chaotic Quantity");
    const at = ladder.rank! - 1;
    expect(ladder.window).toEqual({ start: at - 5, end: at + 6 });
  });

  it("keeps eleven rows at the top by showing more below", () => {
    expect(omens("Omen of Sinistral Annulment").window).toEqual({
      start: 0,
      end: 11,
    });
    expect(omens("Omen of Dextral Erasure").window).toEqual({
      start: 0,
      end: 11,
    });
  });

  it("keeps eleven rows at the bottom by showing more above", () => {
    expect(omens("Omen of the Liege").window).toEqual({ start: 27, end: 38 });
    expect(omens("Omen of Gambling").window).toEqual({ start: 27, end: 38 });
  });

  it("shows a short category whole", () => {
    const ladder = buildLadder({
      items: OMENS.slice(0, 4),
      table: TABLE,
      core: "exalted",
      checked: OMENS[0].name,
    });
    expect(ladder.window).toEqual({ start: 0, end: 4 });
  });

  it("writes estimates worth a divine or more in divines", () => {
    const divine = quoteRate(TABLE, "divine", "exalted")!;
    const estimates = omens("Omen of Light").rows.filter((r) => r.estimate);
    const big = estimates.filter((r) => r.ordering! >= divine);
    const small = estimates.filter((r) => r.ordering! < divine);
    expect(big.length).toBeGreaterThan(0);
    expect(small.length).toBeGreaterThan(0);
    for (const row of big) {
      expect(row.value!.currency).toBe("divine");
      expect(row.value!.value).toBeCloseTo(row.ordering! / divine, 6);
    }
    for (const row of small) expect(row.value!.currency).toBe("exalted");
  });

  it("honours another window size", () => {
    const ladder = buildLadder({
      items: OMENS,
      table: TABLE,
      core: "exalted",
      checked: "Omen of Light",
      window: 2,
    });
    expect(ladder.window).toEqual({ start: 3, end: 8 });
  });

  it("keeps input order for equal values", () => {
    const value = { primaryValue: 0.5, totalChange: 0 };
    const items: LadderItem[] = [
      { name: "A", ns: "ITEM", ninja: value },
      { name: "B", ns: "ITEM", ninja: value },
      { name: "C", ns: "ITEM", ninja: value },
      ...OMENS,
    ];
    const names = omens("B", items).rows.map((r) => r.name);
    const a = names.indexOf("A");
    expect(names.slice(a, a + 3)).toEqual(["A", "B", "C"]);
    const reversed = omens("B", [items[2], items[1], items[0], ...OMENS]);
    const c = reversed.rows.findIndex((r) => r.name === "C");
    expect(reversed.rows.slice(c, c + 3).map((r) => r.name)).toEqual([
      "C",
      "B",
      "A",
    ]);
  });

  it("places an item without a price last, marked", () => {
    // Omen of Chance as if poe.ninja had no line for it and the feed no pair.
    const items = OMENS.map((item) =>
      item.name === "Omen of Chance" ? { name: item.name, ns: item.ns } : item,
    );
    const ladder = omens("Omen of Chance", items);
    const last = ladder.rows.at(-1)!;
    expect(last.name).toBe("Omen of Chance");
    expect(last.noValue).toBe(true);
    expect(last.value).toBeNull();
    expect(last.ordering).toBeNull();
    expect(last.bar).toBe(0);
    expect(ladder.rank).toBe(38);
    expect(ladder.total).toBe(38);
    expect(ladder.rows.slice(0, -1).every((r) => !r.noValue)).toBe(true);
  });

  it("draws dividers at 1 div and 1 ex", () => {
    const ladder = omens("Omen of Light");
    expect(ladder.dividers.map((d) => d.label)).toEqual(["1 div", "1 ex"]);
    const [div, ex] = ladder.dividers;
    expect(div.ordering).toBeCloseTo(DIV_EX, 9);
    expect(ex.ordering).toBe(1);
    for (const d of ladder.dividers) {
      expect(ladder.rows[d.index - 1].ordering!).toBeGreaterThanOrEqual(
        d.ordering,
      );
      expect(ladder.rows[d.index].ordering!).toBeLessThan(d.ordering);
    }
    // Omen of Sanctification (1.57 div) is the last omen worth a divine.
    expect(ladder.rows[div.index - 1].name).toBe("Omen of Sanctification");
    // Omen of Putrefaction (0.001474 div) is just over 1 ex at 681 ex/div.
    expect(ladder.rows[ex.index - 1].name).toBe("Omen of Putrefaction");
    expect(ladder.rows[ex.index].name).toBe("Omen of Sinistral Necromancy");
  });

  it("places dividers in chaos when chaos is the core currency", () => {
    const ladder = buildLadder({
      items: OMENS,
      table: TABLE,
      core: "chaos",
      checked: "Omen of Light",
    });
    const [div, ex] = ladder.dividers;
    expect(div.ordering).toBeCloseTo(quoteRate(TABLE, "divine", "chaos")!, 9);
    expect(ex.ordering).toBeCloseTo(quoteRate(TABLE, "exalted", "chaos")!, 9);
    expect(ladder.rows[div.index - 1].name).toBe("Omen of Sanctification");
  });

  it("scales bars logarithmically between the category's extremes", () => {
    const ladder = omens("Omen of Light");
    const priced = ladder.rows.filter((r) => !r.noValue);
    expect(priced[0].bar).toBe(1);
    expect(priced.at(-1)!.bar).toBe(0);
    const max = Math.log(priced[0].ordering!);
    const min = Math.log(priced.at(-1)!.ordering!);
    const light = ladder.rows[5];
    expect(light.bar).toBeCloseTo(
      (Math.log(light.ordering!) - min) / (max - min),
      9,
    );
  });

  it("has no rank when the item is not in the category", () => {
    const ladder = omens("Arcanist's Etcher");
    expect(ladder.rank).toBeNull();
    expect(ladder.rows.some((r) => r.checked)).toBe(false);
    expect(ladder.window).toEqual({ start: 0, end: 11 });
  });

  it("returns no rows for no items", () => {
    const ladder = omens("Omen of Light", []);
    expect(ladder.rows).toEqual([]);
    expect(ladder.total).toBe(0);
    expect(ladder.rank).toBeNull();
    expect(ladder.dividers).toEqual([]);
    expect(ladder.window).toEqual({ start: 0, end: 0 });
  });
});

describe("buildLadder over every category in the relay fixture", () => {
  // The fixture is trimmed: of the 14 exchange categories it holds Currency
  // (7 lines) and Ritual (all 38); the rest are unique categories and tablets,
  // which the exchange ladder does not serve but must not break on.
  const types = OVERVIEW.itemOverviews.map((o) => o.type);

  it("covers the recorded categories", () => {
    expect(types).toEqual([
      "Currency",
      "Ritual",
      "UniqueArmours",
      "UniqueFlasks",
      "UniqueSanctumRelics",
      "UniqueTablets",
      "PrecursorTablets",
    ]);
  });

  it.each(types)("%s builds without throwing", (type) => {
    const items = categoryItems(type);
    for (const core of ["exalted", "chaos"] as const) {
      for (const item of items) {
        const ladder = buildLadder({
          items,
          table: TABLE,
          core,
          checked: item.name,
        });
        expect(ladder.total).toBe(items.length);
        expect(ladder.rank).not.toBeNull();
        expect(ladder.rows.every((r) => r.bar >= 0 && r.bar <= 1)).toBe(true);
      }
    }
  });

  it("ranks the quote currencies against each other in Currency", () => {
    const ladder = buildLadder({
      items: categoryItems("Currency"),
      table: TABLE,
      core: "exalted",
      checked: "Exalted Orb",
    });
    // A Chaos Orb is worth about 70 ex in this league.
    const names = ladder.rows.map((r) => r.name);
    expect(names.indexOf("Divine Orb")).toBeLessThan(
      names.indexOf("Chaos Orb"),
    );
    expect(names.indexOf("Chaos Orb")).toBeLessThan(
      names.indexOf("Exalted Orb"),
    );
    const exalted = ladder.rows.find((r) => r.name === "Exalted Orb")!;
    expect(exalted.ordering).toBeCloseTo(1, 2);
    expect(ladder.rank).toBe(ladder.rows.indexOf(exalted) + 1);
  });
});

describe("LADDER_CATEGORIES", () => {
  it("names exactly the relay's 14 exchange categories", () => {
    const map = JSON.parse(fixture("relay-namespace-map.json")) as {
      map: Array<{ cx: boolean; type: string }>;
    };
    const exchange = map.map.filter((m) => m.cx).map((m) => m.type);
    expect(exchange).toHaveLength(14);
    expect(Object.keys(LADDER_CATEGORIES).sort()).toEqual(exchange.sort());
    expect(LADDER_CATEGORIES.Ritual).toBe("Omens");
  });
});

describe("ladder.ts under plain Node", () => {
  const FILE = path.resolve(
    __dirname,
    "../../src/web/price-check/ladder/ladder.ts",
  );

  it("loads without a compiler", () => {
    const url = new URL(`file://${FILE}`).href;
    const out = execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(url)}); console.log("ok")`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out.trim()).toBe("ok");
  });

  it("imports nothing from vue or @/", () => {
    expect(fs.readFileSync(FILE, "utf8")).not.toMatch(
      /from\s+["'](vue|@\/[^"']*)["']/,
    );
  });
});

describe("shortNames", () => {
  it("drops the words most of a category shares", () => {
    const short = shortNames([
      "Greater Essence of Seeking",
      "Perfect Essence of Seeking",
      "Essence of Insulation",
      "Greater Essence of Haste",
    ]);
    expect(short.get("Greater Essence of Seeking")).toBe("Greater Seeking");
    expect(short.get("Perfect Essence of Seeking")).toBe("Perfect Seeking");
    expect(short.get("Essence of Insulation")).toBe("Insulation");
  });

  it("shortens omens to what tells them apart", () => {
    const short = shortNames([
      "Omen of Light",
      "Omen of the Liege",
      "Omen of Chaotic Quantity",
    ]);
    expect(short.get("Omen of the Liege")).toBe("the Liege");
    expect(short.get("Omen of Light")).toBe("Light");
  });

  it("keeps a bracketed part whole, so no bracket is left open", () => {
    const short = shortNames([
      "Uncut Skill Gem (Level 8)",
      "Uncut Skill Gem (Level 15)",
      "Uncut Support Gem (Level 1)",
      "Uncut Spirit Gem (Level 12)",
    ]);
    expect(short.get("Uncut Skill Gem (Level 8)")).toBe("Skill (Level 8)");
    expect(short.get("Uncut Support Gem (Level 1)")).toBe("Support (Level 1)");
  });

  it("keeps the full name when nothing would be left, or nothing is shared", () => {
    const short = shortNames(["Essence", "Essence of Haste", "Essence of Ice"]);
    expect(short.get("Essence")).toBe("Essence");
    const mixed = shortNames([
      "Orb of Alchemy",
      "Exalted Orb",
      "Divine Orb",
      "Chaos Orb",
    ]);
    expect(mixed.get("Exalted Orb")).toBe("Exalted");
    expect(mixed.get("Orb of Alchemy")).toBe("Alchemy");
  });

  it("labels ladder rows with the short name", () => {
    const ladder = omens("Omen of Light");
    const row = ladder.rows.find((r) => r.checked)!;
    expect(row.name).toBe("Omen of Light");
    expect(row.label).toBe("Light");
  });
});
