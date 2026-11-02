import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { getDetailsId } from "@/web/price-check/trends/getDetailsId";
import { ItemCategory, ItemRarity, ParsedItem } from "@/parser";

const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/market/relay-overview-forbidden-rites.json",
);
const ITEMS = path.resolve(__dirname, "../../public/data/en/items.ndjson");

interface Line {
  name: string;
  variant?: string;
}

const overview: { itemOverviews: Array<{ type: string; lines: Line[] }> } =
  JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

const uniqueBases = new Map<string, string[]>();
for (const raw of fs.readFileSync(ITEMS, "utf8").split("\n")) {
  if (!raw.trim()) continue;
  const item = JSON.parse(raw);
  if (item.namespace !== "UNIQUE") continue;
  uniqueBases.set(item.refName, [
    ...(uniqueBases.get(item.refName) ?? []),
    item.unique.base,
  ]);
}

function linesOf(type: string) {
  return overview.itemOverviews.find((o) => o.type === type)!.lines;
}

function parsedUnique(line: Line, category: ItemCategory) {
  const base = uniqueBases.get(line.name)!.find((b) => b === line.variant)!;
  return {
    rarity: ItemRarity.Unique,
    category,
    info: {
      namespace: "UNIQUE",
      refName: line.name,
      unique: { base },
    },
  } as unknown as ParsedItem;
}

describe("getDetailsId for uniques", () => {
  it.each([
    ["UniqueFlasks", ItemCategory.Flask],
    ["UniqueSanctumRelics", ItemCategory.SanctumRelic],
  ] as const)("matches every %s price line", (type, category) => {
    const lines = linesOf(type);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(getDetailsId(parsedUnique(line, category))).toEqual({
        ns: "UNIQUE",
        name: line.name,
        variant: line.variant,
      });
    }
  });

  it("keeps the base as variant for other uniques", () => {
    const line = linesOf("UniqueArmours").find(
      (l) => l.name === "Temporalis",
    )!;
    expect(
      getDetailsId(parsedUnique(line, ItemCategory.BodyArmour))!.variant,
    ).toBe(line.variant);
  });
});
