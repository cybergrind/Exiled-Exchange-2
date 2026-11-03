// A related item's price (RelatedItems.vue): the Currency Exchange rate first,
// as the headline does (trends/headlinePrice.ts), then poe.ninja, and a
// reason when neither has the item ("Legacy of …" runes are not on poe.ninja
// and trade rarely on the exchange).
import type { CurrencyValue } from "../../background/Prices.ts";
import type { ExchangeValue } from "../../background/market/exchangeValue.ts";
import { headlinePrice } from "../trends/headlinePrice.ts";

export interface RelatedPrice {
  price?: CurrencyValue;
  /** Where the price comes from, or why there is none. */
  title: string;
}

export function relatedPrice(
  exchange: ExchangeValue | null,
  ninja: CurrencyValue | undefined,
  /** Hours of exchange data loaded. */
  hours: number,
): RelatedPrice {
  if (exchange?.source === "ggg") {
    const { price } = headlinePrice(exchange, () => ninja!);
    return { price, title: `GGG Currency Exchange, last ${hours} h` };
  }
  if (ninja) return { price: ninja, title: "poe.ninja" };
  return {
    title: hours
      ? `No poe.ninja price and no exchange trades in the last ${hours} h`
      : "No poe.ninja price and no exchange data loaded",
  };
}
