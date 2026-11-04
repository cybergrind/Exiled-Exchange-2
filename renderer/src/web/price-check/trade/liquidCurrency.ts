// Trade search currencies. The trade API's price filter takes one currency or
// "exalted_divine"; it cannot exclude Vaal Orbs or other illiquid currencies,
// and it has no Exalted + Divine + Chaos option. The default, LIQUID_CURRENCY,
// searches Exalted or Divine and, when that finds few listings, adds a
// Chaos-only search whose results are merged in by price.
// Pure: no Vue, no `@/`.

/** Default: Exalted or Divine, then Chaos when that finds few. Never sent. */
export const LIQUID_CURRENCY = "liquid";
/** Any currency, Vaal Orbs included: no price option. Never sent. */
export const ANY_CURRENCY = "any";
/** Below this many Exalted or Divine listings, a Chaos search fills in. */
export const CHAOS_FILL_BELOW = 20;

/** The trade API's `trade_filters.filters.price.option` for a filter value. */
export function tradePriceOption(
  currency: string | undefined,
): string | undefined {
  if (currency === LIQUID_CURRENCY) return "exalted_divine";
  if (currency === ANY_CURRENCY || !currency) return undefined;
  return currency;
}

export function needsChaosSearch(
  currency: string | undefined,
  exaltedDivineTotal: number,
): boolean {
  return currency === LIQUID_CURRENCY && exaltedDivineTotal < CHAOS_FILL_BELOW;
}

/**
 * Two cheapest-first lists as one. `first` wins ties; listings without a
 * value keep their order after every priced one.
 */
export function mergeByValue<T>(
  first: readonly T[],
  second: readonly T[],
  valueOf: (item: T) => number | undefined,
): T[] {
  const priced = (list: readonly T[]) =>
    list.filter((item) => valueOf(item) !== undefined);
  const a = priced(first);
  const b = priced(second);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && valueOf(a[i])! <= valueOf(b[j])!)) {
      out.push(a[i++]);
    } else {
      out.push(b[j++]);
    }
  }
  const unpriced = (list: readonly T[]) =>
    list.filter((item) => valueOf(item) === undefined);
  return [...out, ...unpriced(first), ...unpriced(second)];
}
