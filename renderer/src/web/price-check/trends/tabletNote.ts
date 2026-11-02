// poe.ninja prices a non-unique tablet by base and rarity only, so a magic or
// rare tablet's price is the going rate for any such tablet, whatever its
// mods. The trade search is what prices the mods; tabletRating.ts says which
// of them players value.
import { rateTablet } from "../tablets/tabletRating.ts";
import type {
  TabletModInput,
  TabletVerdictLevel,
} from "../tablets/tabletRating.ts";

export function tabletNote(
  name: string,
  rarity: string | undefined,
): string | undefined {
  if (rarity !== "Magic" && rarity !== "Rare") return undefined;
  return `poe.ninja's price for any ${rarity} ${name}: mods are not counted. Search prices these mods.`;
}

export interface TabletSummary {
  level: TabletVerdictLevel;
  headline: string;
  detail: string;
}

/**
 * The verdict line under a magic or rare tablet's price. Without valued mods
 * it points to the normal tablet's price, which such a tablet sells under.
 */
export function tabletSummary(
  name: string,
  rarity: string | undefined,
  mods: readonly TabletModInput[],
  normalPrice?: string,
): TabletSummary | undefined {
  const verdict = rateTablet(name, rarity, mods);
  const note = tabletNote(name, rarity);
  if (!verdict || !note) return undefined;
  return {
    level: verdict.level,
    headline: verdict.text,
    detail:
      verdict.level === "none" && normalPrice
        ? `A Normal ${name} is ${normalPrice} on poe.ninja.`
        : note,
  };
}
