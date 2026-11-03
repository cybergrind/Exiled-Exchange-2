import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { parseClipboard } from "@/parser";

const DATA = path.resolve(__dirname, "../../public/data");
const LANGS = fs
  .readdirSync(DATA)
  .filter((dir) => fs.existsSync(path.join(DATA, dir, "stats.ndjson")));

describe("stat matchers", () => {
  // Clipboard lines never start with a space, so a matcher with one after
  // its line break never matches (Redemption's Explosive Rhythm did not).
  it.each(LANGS)("%s: no space after a line break", (lang) => {
    const bad = fs
      .readFileSync(path.join(DATA, lang, "stats.ndjson"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((stat) =>
        stat.matchers.some((m: { string: string }) => m.string.includes("\n ")),
      )
      .map((stat) => stat.ref);
    expect(bad).toEqual([]);
  });
});

describe("Redemption Explosive Rhythm", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("parses, and fewer Grenade uses is the better roll", () => {
    const item = parseClipboard(`Item Class: Crossbows
Rarity: Unique
Redemption
Trarthan Cannon
--------
Item Level: 80
--------
{ Unique Modifier }
Gain 1 Explosive Rhythm every 2(2-3) times you use a Grenade Skill
Remove all Explosive Rhythm on reaching 10 to gain Explosive Fervour for 10 Seconds
`)._unsafeUnwrap();
    const calc = item.statsByType.find((c) =>
      c.stat.ref.startsWith("Gain 1 Explosive Rhythm"),
    )!;
    expect(calc.sources[0].contributes?.value).toBe(2);
    expect(calc.stat.better).toBe(-1);
  });
});
