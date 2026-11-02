// Feeds buildLadder from the app's state (guide/poe-source.html, D6 and
// WP-41): the item's poe.ninja category from the relay, the Currency
// Exchange pairs from the market store, icons from the item database.
import { ITEM_BY_REF } from "@/assets/data";
import type { BaseType } from "@/assets/data";
import { usePoeninja } from "@/web/background/Prices";
import { useMarket } from "@/web/background/marketStore";
import { buildLadder, LADDER_CATEGORIES } from "./ladder";
import type { Ladder, LadderItem } from "./ladder";

export interface ItemLadder {
  ladder: Ladder;
  /** Label for the rank line, e.g. "Omens". */
  category: string;
}

/** Null for anything outside the 14 exchange categories. */
export function ladderFor(query: {
  ns: string;
  name: string;
}): ItemLadder | null {
  const { categoryLines, xchgRateCurrency } = usePoeninja();
  const market = useMarket();

  // An item poe.ninja does not list joins the category of its other tiers,
  // unpriced unless the exchange traded it.
  const listed = categoryLines(query) !== undefined;
  const category = categoryLines(query, { family: true });
  if (!category) return null;
  const label = LADDER_CATEGORIES[category.type];
  if (!label) return null;

  const ns = query.ns as BaseType["namespace"];
  const items: LadderItem[] = category.lines.map((line) => ({
    name: line.name,
    ns: query.ns,
    icon: ITEM_BY_REF(ns, line.name)?.[0]?.icon,
    ninja: {
      primaryValue: line.primaryValue,
      totalChange: line.totalChange,
    },
    pairs: market.pairsFor(query.ns, line.name),
  }));
  if (!listed) {
    items.push({
      name: query.name,
      ns: query.ns,
      icon: ITEM_BY_REF(ns, query.name)?.[0]?.icon,
      pairs: market.pairsFor(query.ns, query.name),
    });
  }
  const ladder = buildLadder({
    items,
    table: market.table.value,
    core: xchgRateCurrency.value?.id === "chaos" ? "chaos" : "exalted",
    checked: query.name,
  });
  return ladder.rows.length ? { ladder, category: label } : null;
}
