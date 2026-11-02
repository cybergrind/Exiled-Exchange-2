import type { CurrencyValue } from "@/web/background/Prices";
import type { ExchangeValue } from "@/web/background/market/exchangeValue";
import type { QuoteCurrency } from "@/web/background/market/types";

export interface HeadlinePrice {
  price: CurrencyValue;
  source: "ggg" | "ninja";
  /** The pair the price is read from, when it comes from the exchange. */
  selected?: QuoteCurrency;
}

const AS_CURRENCY_VALUE: Record<QuoteCurrency, CurrencyValue["currency"]> = {
  exalted: "exalted",
  chaos: "chaos",
  divine: "div",
};

/**
 * The price shown large in the price check (guide/poe-source.html, WP-14).
 * A Currency Exchange rate is shown in its own currency; poe.ninja's value
 * is only used when the feed has no liquid pair for the item.
 */
export function headlinePrice(
  exchange: ExchangeValue | null,
  ninja: () => CurrencyValue,
): HeadlinePrice {
  if (exchange?.source === "ggg") {
    return {
      price: {
        min: exchange.value,
        max: exchange.value,
        currency: AS_CURRENCY_VALUE[exchange.currency],
      },
      source: "ggg",
      selected: exchange.currency,
    };
  }
  return { price: ninja(), source: "ninja" };
}

/** Value of `count` items: the exchange rate times the count, else poe.ninja. */
export function stackPrice(
  count: number,
  exchange: ExchangeValue | null,
  ninja: (count: number) => CurrencyValue,
): CurrencyValue {
  const one = headlinePrice(exchange, () => ninja(count));
  if (one.source === "ninja") return one.price;
  return {
    min: one.price.min * count,
    max: one.price.max * count,
    currency: one.price.currency,
  };
}
