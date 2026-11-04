import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";
import { createPresets } from "@/web/price-check/filters/create-presets";
import { uniqueRollBadge } from "@/web/price-check/filters/rollProfile";
import type { RollProfileFile } from "@/web/background/market/rollProfileSchema";

// Clipboard text → search filters → badge, against the shipped profiles, as
// FilterModifier.vue does it.
const PROFILES: RollProfileFile = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/data/poe-source/unique-rolls.json"),
    "utf8",
  ),
);

function badges(text: string) {
  const item = parseClipboard(text)._unsafeUnwrap();
  // The price check's default preset for a unique (pseudo, initUiModFilters).
  const { presets, active } = createPresets(item, {
    league: "Forbidden Rites",
    currency: undefined,
    listingType: "available",
    collapseListings: "api",
    activateStockFilter: false,
    searchStatRange: 10,
    useEn: true,
    defaultAllSelected: false,
  });
  return presets
    .find((preset) => preset.id === active)!
    .stats.map((filter) => {
      const roll = filter.roll;
      return [
        filter.statRef,
        uniqueRollBadge(
          PROFILES,
          item.info.refName,
          filter.statRef,
          roll?.bounds && roll.bounds.min !== roll.bounds.max
            ? { goodness: roll.goodness, value: roll.value }
            : undefined,
        ),
      ] as const;
    });
}

const unique = (cls: string, name: string, base: string, mods: string[]) =>
  `Item Class: ${cls}
Rarity: Unique
${name}
${base}
--------
Item Level: 80
--------
${mods.map((mod) => `{ Unique Modifier }\n${mod}`).join("\n")}
`;

describe("unique roll badges from clipboard text", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("grades a negative cooldown roll (Temporalis)", () => {
    const result = new Map(
      badges(
        unique("Body Armours", "Temporalis", "Silk Robe", [
          "Skills have -1.9(-2--1) seconds to Cooldown",
          "+80(60-100) to maximum Energy Shield",
        ]),
      ),
    );
    // -1.9 s passes the "good" mark (-1.7) but not the guide's -2 s.
    expect(result.get("Skills have # seconds to Cooldown")).toMatchObject({
      importance: "key",
      grade: "good",
    });
    // Filler on a profiled unique: no grade.
    expect(result.get("# to maximum Energy Shield")).toEqual({});
  });

  it("grades a 'reduced' drawback where less is better (Blackflame)", () => {
    const grade = (shown: number) =>
      new Map(
        badges(
          unique("Rings", "Blackflame", "Amethyst Ring", [
            `${shown}(60-75)% reduced Ignite Duration on Enemies`,
          ]),
        ),
      ).get("#% increased Ignite Duration on Enemies");
    // Thresholds good 65 / great 62 on the shown number.
    expect(grade(61)).toMatchObject({ importance: "good", grade: "top" });
    expect(grade(64)).toMatchObject({ importance: "good", grade: "good" });
    expect(grade(70)).toEqual({
      importance: "good",
      why: expect.any(String),
    });
  });

  it("grades a 'fewer' roll by the number shown (Constricting Command)", () => {
    const result = new Map(
      badges(
        unique("Helmets", "Constricting Command", "Viper Cap", [
          "Require 4(2-4) fewer enemies to be Surrounded",
        ]),
      ),
    );
    expect(
      result.get("Require # additional enemies to be Surrounded"),
    ).toMatchObject({ importance: "good", grade: "perfect" });
  });
});
