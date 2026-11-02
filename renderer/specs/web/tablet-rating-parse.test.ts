import { beforeAll, describe, expect, it } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import {
  rateTablet,
  unparsedRef,
} from "@/web/price-check/tablets/tabletRating";

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
    ...item.unknownModifiers.map((mod) => ({ statRef: unparsedRef(mod.text) })),
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

  it("finds the Expedition Remnant mod among the unparsed lines", () => {
    const verdict = rate(
      tablet("Magic", "Expedition Tablet", [
        "Expeditions have +35% Surpassing chance to contain an additional Verisium Remnant",
      ]),
    )!;
    expect(verdict.text).toBe("Always money: Extra Remnant");
  });
});
