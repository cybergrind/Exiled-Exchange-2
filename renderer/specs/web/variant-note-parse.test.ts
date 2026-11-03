import { beforeAll, describe, expect, it } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { variantNote } from "@/web/price-check/trends/variantNote";
import { variantModInput } from "@/web/price-check/trends/variantMods";

// Advanced-copy text (Ctrl+Alt+C) through the parser into the note, as the
// price panel does.
function note(text: string) {
  const item = parseClipboard(text)._unsafeUnwrap();
  return variantNote(
    {
      name: item.info.refName,
      base: item.info.unique!.base,
      fixedStats: item.info.unique!.fixedStats,
    },
    item.statsByType.map(variantModInput),
  );
}

function unique(cls: string, name: string, base: string, mods: string[]) {
  return `Item Class: ${cls}
Rarity: Unique
${name}
${base}
--------
Item Level: 80
--------
${mods.map((mod) => `{ Unique Modifier }\n${mod}`).join("\n")}
`;
}

describe("variant note from clipboard text", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("names Mageblood's Legacies", () => {
    const result = note(
      unique("Belts", "Mageblood", "Utility Belt", [
        "Legacy of Quicksilver",
        "Legacy of Ruby",
        "Legacy of Gold",
        "Legacy of Bismuth",
        "All Mage's Legacies have 33(25-35)% increased effect per duplicate Mage's Legacy you have",
      ]),
    )!;
    expect(result.mods).toEqual([
      "Legacy of Quicksilver",
      "Legacy of Ruby",
      "Legacy of Gold",
      "Legacy of Bismuth",
    ]);
  });

  it("names From Nothing's passive", () => {
    expect(
      note(
        unique("Jewels", "From Nothing", "Diamond", [
          "Passives in Radius of Conduit can be Allocated\nwithout being connected to your tree",
        ]),
      )?.mods,
    ).toEqual([
      "Passives in Radius of Conduit can be Allocated without being connected to your tree",
    ]);
  });

  it("names Rite of Passage's Spirit with its duration", () => {
    expect(
      note(
        unique("Charms", "Rite of Passage", "Golden Charm", [
          "Possessed by Spirit Of The Stag for 18(12-20) seconds on use",
        ]),
      )?.mods,
    ).toEqual(["Possessed by Spirit Of The Stag for 18 seconds on use"]);
  });

  it("says nothing for a unique without versions", () => {
    expect(
      note(
        unique("Life Flasks", "Opportunity", "Ultimate Life Flask", [
          "Skills have 81(60-90)% longer Perfect Timing window during effect",
        ]),
      ),
    ).toBeUndefined();
  });
});
