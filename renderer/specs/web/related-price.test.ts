import { describe, expect, it } from "vitest";
import { relatedPrice } from "@/web/price-check/related-items/relatedPrice.ts";
import type { ExchangeValue } from "@/web/background/market/exchangeValue.ts";

// Related items (Lifesprig → Legacy of Lifesprig → Aldur's Legacy): the
// exchange rate first, as the headline does, then poe.ninja, and a reason
// when neither has the item.
const ggg: ExchangeValue = {
  rule: 1,
  source: "ggg",
  currency: "exalted",
  value: 12,
  ordering: 12,
};

describe("relatedPrice", () => {
  it("prefers the exchange rate", () => {
    expect(
      relatedPrice(ggg, { min: 30, max: 30, currency: "exalted" }, 6),
    ).toEqual({
      price: { min: 12, max: 12, currency: "exalted" },
      title: "GGG Currency Exchange, last 6 h",
    });
  });

  it("falls back to poe.ninja", () => {
    const ninja = { min: 660, max: 660, currency: "div" as const };
    expect(relatedPrice(null, ninja, 6)).toEqual({
      price: ninja,
      title: "poe.ninja",
    });
  });

  it("says why there is no price", () => {
    expect(relatedPrice(null, undefined, 6)).toEqual({
      title: "No poe.ninja price and no exchange trades in the last 6 h",
    });
    expect(relatedPrice(null, undefined, 0).title).toBe(
      "No poe.ninja price and no exchange data loaded",
    );
  });
});
