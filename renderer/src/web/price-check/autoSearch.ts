import { ItemCategory, ItemRarity, ParsedItem } from "@/parser";
import { CATEGORY_TO_TRADE_ID } from "./trade/pathofexile-trade";

export interface AutoSearchOptions {
  advancedCheck: boolean;
  smartInitialSearch: boolean;
  lockedInitialSearch: boolean;
  /** Offer and run stash searches for Currency Exchange items too; off when unset. */
  exchangeAutoSearch?: boolean;
  /** The item trades on the Currency Exchange. */
  isExchangeItem: boolean;
}

/**
 * Whether the price check offers a stash search at all. Currency Exchange
 * items are priced by the exchange panel; stash offers are thin, often stale,
 * and not what the exchange trades at.
 */
export function offersTradeSearch(
  opts: Pick<AutoSearchOptions, "exchangeAutoSearch" | "isExchangeItem">,
): boolean {
  return !opts.isExchangeItem || Boolean(opts.exchangeAutoSearch);
}

/** Whether the listing search starts without pressing Search. */
export function shouldAutoSearch(
  item: ParsedItem,
  opts: AutoSearchOptions,
): boolean {
  if (
    (!opts.advancedCheck && !opts.smartInitialSearch) ||
    (opts.advancedCheck && !opts.lockedInitialSearch)
  ) {
    return false;
  }
  if (!offersTradeSearch(opts)) {
    return false;
  }
  return Boolean(
    item.rarity === ItemRarity.Unique ||
      item.category === ItemCategory.HeistBlueprint ||
      item.category === ItemCategory.SanctumRelic ||
      item.category === ItemCategory.Charm ||
      !CATEGORY_TO_TRADE_ID.has(item.category!) ||
      item.isUnidentified ||
      item.isVeiled,
  );
}
