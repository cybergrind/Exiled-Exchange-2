import { describe, expect, it } from "vitest";
import {
  offersTradeSearch,
  shouldAutoSearch,
} from "@/web/price-check/autoSearch";
import { ItemCategory, ItemRarity, ParsedItem } from "@/parser";

function item(fields: Partial<ParsedItem>) {
  return { isUnidentified: false, isVeiled: false, ...fields } as ParsedItem;
}

const CURRENCY = item({
  rarity: ItemRarity.Normal,
  category: undefined,
});
const UNIQUE = item({
  rarity: ItemRarity.Unique,
  category: ItemCategory.BodyArmour,
});
const RARE_RING = item({
  rarity: ItemRarity.Rare,
  category: ItemCategory.Ring,
});

const ON = {
  advancedCheck: true,
  smartInitialSearch: true,
  lockedInitialSearch: true,
  exchangeAutoSearch: false,
  isExchangeItem: false,
};

describe("shouldAutoSearch", () => {
  it("does not search stash offers for exchange items by default", () => {
    expect(shouldAutoSearch(CURRENCY, { ...ON, isExchangeItem: true })).toBe(
      false,
    );
  });

  it("treats a config without the setting as off", () => {
    const withoutSetting: Parameters<typeof shouldAutoSearch>[1] = { ...ON };
    delete withoutSetting.exchangeAutoSearch;
    expect(
      shouldAutoSearch(CURRENCY, { ...withoutSetting, isExchangeItem: true }),
    ).toBe(false);
  });

  it("searches exchange items when the setting is on, as before", () => {
    expect(
      shouldAutoSearch(CURRENCY, {
        ...ON,
        isExchangeItem: true,
        exchangeAutoSearch: true,
      }),
    ).toBe(true);
  });

  it("keeps the old rules for everything else", () => {
    expect(shouldAutoSearch(UNIQUE, ON)).toBe(true);
    expect(shouldAutoSearch(RARE_RING, ON)).toBe(false);
    expect(shouldAutoSearch(CURRENCY, ON)).toBe(true);
  });

  it("respects the initial-search settings", () => {
    expect(
      shouldAutoSearch(UNIQUE, { ...ON, lockedInitialSearch: false }),
    ).toBe(false);
    expect(
      shouldAutoSearch(UNIQUE, {
        ...ON,
        advancedCheck: false,
        smartInitialSearch: false,
      }),
    ).toBe(false);
  });
});

describe("offersTradeSearch", () => {
  it("offers no stash search for Currency Exchange items", () => {
    expect(offersTradeSearch({ isExchangeItem: true })).toBe(false);
    expect(
      offersTradeSearch({ isExchangeItem: true, exchangeAutoSearch: false }),
    ).toBe(false);
  });

  it("keeps it for exchange items when the setting asks for stash offers", () => {
    expect(
      offersTradeSearch({ isExchangeItem: true, exchangeAutoSearch: true }),
    ).toBe(true);
  });

  it("keeps it for everything else", () => {
    expect(offersTradeSearch({ isExchangeItem: false })).toBe(true);
  });
});
