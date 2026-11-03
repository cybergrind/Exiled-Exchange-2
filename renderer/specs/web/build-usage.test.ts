import { describe, expect, it } from "vitest";
import { buildUsage } from "@/web/price-check/trends/buildUsage.ts";
import type { UniqueBuildsFile } from "@/web/price-check/trends/buildUsage.ts";

const FILE: UniqueBuildsFile = {
  league: "Forbidden Rites",
  verifiedOn: "2026-11-03",
  builds: [
    {
      id: 4,
      name: "Hollow Form MA",
      rank: "Maxroll S #4",
      url: "https://a",
      date: "2026-09-03",
    },
    {
      id: 7,
      name: "Falling Thunder MA",
      rank: "Maxroll A #3",
      url: "https://b",
      date: "2026-09-03",
    },
    {
      id: 16,
      name: "Arc Totem Gemling",
      rank: "Odealo #4",
      url: "https://c",
      date: "2026-06-30",
    },
  ],
  uniques: {
    "Heart of the Well": [
      { build: 4, core: false, label: "endgame" },
      { build: 7, core: true },
      { build: 16, core: true },
    ],
  },
};

describe("buildUsage", () => {
  it("lists builds that require the unique first, then by rank", () => {
    expect(
      buildUsage(FILE, "Heart of the Well").map((b) => [b.name, b.role]),
    ).toEqual([
      ["Falling Thunder MA", "required"],
      ["Arc Totem Gemling", "required"],
      ["Hollow Form MA", "endgame"],
    ]);
  });

  it("carries the guide link and a tooltip", () => {
    const first = buildUsage(FILE, "Heart of the Well")[0];
    expect(first.url).toBe("https://b");
    expect(first.title).toBe(
      "Falling Thunder MA: required · Maxroll A #3 · guide 2026-09-03",
    );
  });

  it("is empty for a unique no surveyed build uses", () => {
    expect(buildUsage(FILE, "Mageblood")).toEqual([]);
    expect(buildUsage(undefined, "Heart of the Well")).toEqual([]);
  });
});
