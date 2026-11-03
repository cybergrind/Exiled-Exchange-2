import { describe, expect, it } from "vitest";
import { variantNote } from "@/web/price-check/trends/variantNote.ts";
import type { VariantModInput } from "@/web/price-check/trends/variantNote.ts";

// poe.ninja keeps one line per unique and base, so a unique whose versions
// differ by a chosen mod (Mageblood's Legacies, From Nothing's passive, Rite
// of Passage's Spirit) gets one price for all of them.
const mod = (
  ref: string,
  text: string,
  extra: Partial<VariantModInput> = {},
): VariantModInput => ({
  ref,
  text,
  option: false,
  type: "explicit",
  ...extra,
});

const LEGACY = "Legacy of #";

describe("variantNote", () => {
  it("names the chosen options, such as Mageblood's Legacies", () => {
    const note = variantNote({ name: "Mageblood", base: "Utility Belt" }, [
      mod(LEGACY, "Legacy of Quicksilver", { option: true }),
      mod(LEGACY, "Legacy of Ruby", { option: true }),
      mod(
        "All Mage's Legacies have #% increased effect per duplicate Mage's Legacy you have",
        "All Mage's Legacies have 33% increased effect per duplicate Mage's Legacy you have",
      ),
    ])!;
    expect(note.headline).toBe(
      "poe.ninja prices every version of Mageblood together",
    );
    expect(note.mods).toEqual(["Legacy of Quicksilver", "Legacy of Ruby"]);
    expect(note.detail).toBe(
      "This one: Legacy of Quicksilver · Legacy of Ruby. Search prices it.",
    );
  });

  it("treats a mod outside the unique's fixed mods as its version", () => {
    const note = variantNote(
      {
        name: "Rite of Passage",
        base: "Golden Charm",
        fixedStats: ["Used when you Kill a Rare or Unique Enemy"],
      },
      [
        mod(
          "Used when you kill a Rare or Unique enemy",
          "Used when you kill a Rare or Unique enemy",
        ),
        mod(
          "Possessed by Spirit Of The Stag for # seconds on use",
          "Possessed by Spirit Of The Stag for 18 seconds on use",
        ),
      ],
    )!;
    expect(note.mods).toEqual([
      "Possessed by Spirit Of The Stag for 18 seconds on use",
    ]);
  });

  it("leaves implicits alone unless the base is Runemastered", () => {
    const fixed = ["#% increased Armour, Evasion and Energy Shield"];
    const implicit = mod("+# to Spirit per Socket filled", "+11 to Spirit", {
      type: "implicit",
    });
    expect(
      variantNote(
        { name: "Morior Invictus", base: "Grand Regalia", fixedStats: fixed },
        [implicit],
      ),
    ).toBeUndefined();
    expect(
      variantNote(
        {
          name: "Morior Invictus",
          base: "Runemastered Grand Regalia",
          fixedStats: fixed,
        },
        [implicit],
      )?.mods,
    ).toEqual(["+11 to Spirit"]);
  });

  it("says nothing for a unique with only fixed mods", () => {
    expect(
      variantNote({ name: "Opportunity", base: "Ultimate Life Flask" }, [
        mod(
          "Skills have #% longer Perfect Timing window during effect",
          "Skills have 81% longer Perfect Timing window during effect",
        ),
      ]),
    ).toBeUndefined();
  });

  it("counts mods past four instead of naming them", () => {
    const mods = ["Ruby", "Gold", "Jade", "Topaz", "Bismuth", "Amethyst"].map(
      (gem) => mod(LEGACY, `Legacy of ${gem}`, { option: true }),
    );
    const note = variantNote({ name: "Mageblood", base: "Utility Belt" }, mods)!;
    expect(note.mods).toHaveLength(6);
    expect(note.detail).toBe(
      "This one: Legacy of Ruby · Legacy of Gold · Legacy of Jade · Legacy of Topaz, and 2 more. Search prices it.",
    );
  });
});
