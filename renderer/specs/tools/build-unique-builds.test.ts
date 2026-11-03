import { describe, expect, it } from "vitest";
import {
  parseSurvey,
  splitUniques,
} from "../../../tools/build-unique-builds.ts";

describe("splitUniques", () => {
  it("keeps the guide's label and drops nested notes", () => {
    expect(
      splitUniques(
        "Berek's Grip (budget alt to The Taming), Headhunter (endgame (AOEAH gear list only)), Mageblood",
      ),
    ).toEqual([
      { name: "Berek's Grip", label: "budget alt to The Taming" },
      { name: "Headhunter", label: "endgame" },
      { name: "Mageblood" },
    ]);
    expect(splitUniques("none")).toEqual([]);
  });
});

describe("parseSurvey", () => {
  it("reads builds and their core and optional uniques", () => {
    const md = `## Builds

| # | Build | Rank in sources | Guide (date) | Core uniques | Optional uniques |
|---|---|---|---|---|---|
| 7 | Falling Thunder Martial Artist | Maxroll A #3 | https://maxroll.gg/x (2026-09-03) | Shavronne's Satchel, Heart of the Well | Prism of Belief (optional) |

## Unique frequency
`;
    const { builds, uses } = parseSurvey(md);
    expect(builds).toEqual([
      {
        id: 7,
        name: "Falling Thunder Martial Artist",
        rank: "Maxroll A #3",
        url: "https://maxroll.gg/x",
        date: "2026-09-03",
      },
    ]);
    expect(uses).toEqual([
      { unique: "Shavronne's Satchel", build: 7, core: true },
      { unique: "Heart of the Well", build: 7, core: true },
      { unique: "Prism of Belief", build: 7, core: false, label: "optional" },
    ]);
  });
});
