import { describe, expect, it } from "vitest";
import {
  headlinePrice,
  stackPrice,
} from "@/web/price-check/trends/headlinePrice";
import type { ExchangeValue } from "@/web/background/market/exchangeValue";

const NINJA = { min: 12.3, max: 12.3, currency: "exalted" as const };

function ggg(over: Partial<ExchangeValue>): ExchangeValue {
  return {
    rule: 1,
    source: "ggg",
    currency: "exalted",
    value: 4.908,
    low: 3,
    high: 14,
    traded: 2456,
    asOfHour: 1793599200,
    ordering: 4.908,
    ...over,
  };
}

describe("headlinePrice", () => {
  it("shows the item's own exchange rate, not poe.ninja's divine-converted value", () => {
    const h = headlinePrice(ggg({}), () => NINJA);
    expect(h.price).toEqual({ min: 4.908, max: 4.908, currency: "exalted" });
    expect(h.source).toBe("ggg");
    expect(h.selected).toBe("exalted");
  });

  it("keeps another pair's currency instead of converting it", () => {
    const h = headlinePrice(
      ggg({ rule: 2, currency: "divine", value: 0.019, ordering: 12.9 }),
      () => NINJA,
    );
    expect(h.price).toEqual({ min: 0.019, max: 0.019, currency: "div" });
    expect(h.selected).toBe("divine");
  });

  it("falls back to poe.ninja when the feed has no liquid pair", () => {
    const rule3: ExchangeValue = {
      rule: 3,
      source: "ninja",
      currency: "exalted",
      value: 12.1,
      ordering: 12.1,
    };
    expect(headlinePrice(rule3, () => NINJA)).toEqual({
      price: NINJA,
      source: "ninja",
    });
    expect(headlinePrice(null, () => NINJA)).toEqual({
      price: NINJA,
      source: "ninja",
    });
  });
});

describe("stackPrice", () => {
  it("multiplies the exchange rate by the stack, in the pair's currency", () => {
    expect(stackPrice(20, ggg({}), (n) => ({ ...NINJA, min: n }))).toEqual({
      min: 4.908 * 20,
      max: 4.908 * 20,
      currency: "exalted",
    });
  });

  it("asks poe.ninja for the whole stack when there is no exchange rate", () => {
    const ninja = (n: number) => ({
      min: n * 12.3,
      max: n * 12.3,
      currency: "exalted" as const,
    });
    expect(stackPrice(3, null, ninja).min).toBeCloseTo(36.9);
  });
});
