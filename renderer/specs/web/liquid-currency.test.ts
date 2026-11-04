import { describe, expect, it } from "vitest";
import {
  ANY_CURRENCY,
  CHAOS_FILL_BELOW,
  LIQUID_CURRENCY,
  mergeByValue,
  needsChaosSearch,
  tradePriceOption,
} from "@/web/price-check/trade/liquidCurrency";

describe("tradePriceOption", () => {
  it("searches Exalted or Divine for the liquid default", () => {
    expect(tradePriceOption(LIQUID_CURRENCY)).toBe("exalted_divine");
  });

  it("sends no price option for any currency", () => {
    expect(tradePriceOption(ANY_CURRENCY)).toBeUndefined();
    expect(tradePriceOption(undefined)).toBeUndefined();
  });

  it("passes a single currency through", () => {
    expect(tradePriceOption("chaos")).toBe("chaos");
    expect(tradePriceOption("exalted_divine")).toBe("exalted_divine");
  });
});

describe("needsChaosSearch", () => {
  it("only for the liquid default, when Exalted or Divine finds few", () => {
    expect(needsChaosSearch(LIQUID_CURRENCY, CHAOS_FILL_BELOW - 1)).toBe(true);
    expect(needsChaosSearch(LIQUID_CURRENCY, CHAOS_FILL_BELOW)).toBe(false);
    expect(needsChaosSearch("exalted_divine", 0)).toBe(false);
    expect(needsChaosSearch(ANY_CURRENCY, 0)).toBe(false);
    expect(needsChaosSearch(undefined, 0)).toBe(false);
  });
});

describe("mergeByValue", () => {
  const value = (r: { v?: number }) => r.v;

  it("merges two cheapest-first lists into one", () => {
    const exDiv = [
      { id: "a", v: 1 },
      { id: "b", v: 5 },
      { id: "c", v: 9 },
    ];
    const chaos = [
      { id: "x", v: 2 },
      { id: "y", v: 7 },
    ];
    expect(mergeByValue(exDiv, chaos, value).map((r) => r.id)).toEqual([
      "a",
      "x",
      "b",
      "y",
      "c",
    ]);
  });

  it("keeps the first list ahead on ties and puts unpriced ones last", () => {
    const exDiv = [{ id: "a", v: 3 }, { id: "n" }];
    const chaos = [{ id: "x", v: 3 }, { id: "m" }];
    expect(mergeByValue(exDiv, chaos, value).map((r) => r.id)).toEqual([
      "a",
      "x",
      "n",
      "m",
    ]);
  });
});
