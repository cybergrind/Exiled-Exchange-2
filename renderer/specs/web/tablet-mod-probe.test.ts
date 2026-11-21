import { describe, expect, it } from "vitest";
import {
  PROBE_MAX_SEARCHES,
  modValues,
  planModProbe,
  probeTrade,
} from "@/web/price-check/tablets/modProbe";
import { FilterTag } from "@/web/price-check/filters/interfaces";
import type {
  ItemFilters,
  StatFilter,
} from "@/web/price-check/filters/interfaces";

// "Value the mods" (guide/tablets.html T-6b): on a user's tablet price check,
// one search with all rated mods, then one without each rated mod; the floor
// gap is what that mod adds. At most PROBE_MAX_SEARCHES searches.
function filter(statRef: string, disabled = false): StatFilter {
  return {
    tradeId: ["explicit.stat_1"],
    statRef,
    text: statRef,
    tag: FilterTag.Explicit,
    sources: [],
    disabled,
  };
}

const ABYSS = "Abyss Tablet";
const USES = "# uses remaining";
const RANDOM = "Map has # additional random Modifier"; // money
const REWARDS = "Abyss Pits in Map are twice as likely to have Rewards"; // good
const DESECRATED =
  "#% increased chance for Desecrated Currency from Abysses in Map"; // good
const RARES = "Map has #% increased number of Rare Monsters"; // good on Abyss
const RARITY = "#% increased Rarity of Items found"; // multiplier
const EXILE = "Map is inhabited by # additional Rogue Exile"; // multiplier
const GOLD = "#% increased Gold found in Map"; // unrated

const enabled = (stats: StatFilter[]) =>
  stats.filter((s) => !s.disabled).map((s) => s.statRef);

describe("planModProbe", () => {
  it("searches all rated mods, then each one dropped", () => {
    const stats = [
      filter(REWARDS),
      filter(DESECRATED),
      filter(GOLD, true),
      filter(USES),
    ];
    const plan = planModProbe(ABYSS, stats)!;
    expect(plan.map((p) => p.dropped)).toEqual([
      undefined,
      REWARDS,
      DESECRATED,
    ]);
    expect(enabled(plan[0].stats)).toEqual([REWARDS, DESECRATED, USES]);
    expect(enabled(plan[1].stats)).toEqual([DESECRATED, USES]);
    expect(enabled(plan[2].stats)).toEqual([REWARDS, USES]);
  });

  it("never ticks a mod the user left unticked, and leaves the input alone", () => {
    const stats = [filter(REWARDS), filter(GOLD, true), filter(RARES, true)];
    const plan = planModProbe(ABYSS, stats)!;
    for (const probe of plan) {
      expect(enabled(probe.stats)).not.toContain(GOLD);
      expect(enabled(probe.stats)).not.toContain(RARES);
    }
    expect(plan.map((p) => p.dropped)).toEqual([undefined, REWARDS]);
    expect(stats[0].disabled).toBe(false);
  });

  it(`stays within ${PROBE_MAX_SEARCHES} searches, dropping the most valuable mods first`, () => {
    const stats = [
      filter(RARITY),
      filter(EXILE),
      filter(REWARDS),
      filter(RANDOM),
      filter(DESECRATED),
      filter(RARES),
    ];
    const plan = planModProbe(ABYSS, stats)!;
    expect(plan).toHaveLength(PROBE_MAX_SEARCHES);
    expect(plan.map((p) => p.dropped)).toEqual([
      undefined,
      RANDOM,
      REWARDS,
      DESECRATED,
      RARES,
    ]);
  });

  it("has nothing to probe without a ticked rated mod, or off a tablet", () => {
    expect(planModProbe(ABYSS, [filter(GOLD), filter(USES)])).toBeUndefined();
    expect(planModProbe("Not A Tablet", [filter(RARITY)])).toBeUndefined();
  });
});

describe("probeTrade", () => {
  it("asks for fresh listings from online sellers, keeping the league", () => {
    const trade: ItemFilters["trade"] = {
      offline: true,
      onlineInLeague: false,
      listingType: "any",
      listed: undefined,
      currency: "divine",
      league: "Forbidden Rites",
      collapseListings: "app",
    };
    const fresh = probeTrade(trade);
    expect(fresh.listed).toBe("1week");
    expect(fresh.offline).toBe(false);
    expect(fresh.listingType).toBe("online");
    expect(fresh.league).toBe("Forbidden Rites");
    expect(fresh.currency).toBeUndefined();
    expect(trade.offline).toBe(true);
  });
});

describe("modValues", () => {
  const plan = planModProbe(ABYSS, [filter(REWARDS), filter(DESECRATED)])!;

  it("gives each mod what it adds and its multiplier", () => {
    // all: 4 div; without rewards: 1 div; without desecrated: 2 div.
    const result = modValues(ABYSS, plan, [4, 1, 2]);
    expect(result.floorAll).toBe(4);
    expect(result.mods).toEqual([
      expect.objectContaining({
        statRef: REWARDS,
        short: "Pit rewards",
        floorWithout: 1,
        adds: 3,
        multiplier: 4,
      }),
      expect.objectContaining({
        statRef: DESECRATED,
        floorWithout: 2,
        adds: 2,
        multiplier: 2,
      }),
    ]);
  });

  it("reads a floor that does not drop as adding nothing", () => {
    const result = modValues(ABYSS, plan, [4, 4.2, 4]);
    expect(result.mods[0].adds).toBe(0);
    expect(result.mods[0].multiplier).toBe(1);
  });

  it("leaves a mod unvalued when either floor is missing", () => {
    expect(modValues(ABYSS, plan, [undefined, 1, 2]).mods[0].adds).toBe(
      undefined,
    );
    const thin = modValues(ABYSS, plan, [4, undefined, 2]).mods[0];
    expect(thin.adds).toBeUndefined();
    expect(thin.multiplier).toBeUndefined();
  });
});
