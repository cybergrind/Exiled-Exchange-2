// poe.ninja prices a non-unique tablet by base and rarity only, so a magic or
// rare tablet's price is the going rate for any such tablet, whatever its
// mods. The trade search is what prices the mods; tabletRating.ts says which
// of them players value.
import { rateTablet, TABLET_ASK_FLOORS } from "../tablets/tabletRating.ts";
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
  /** Where the headline's priced set comes from, for a tooltip. */
  comboNote?: string;
  /** The dated real-currency floor beside poe.ninja's, where measured. */
  floor?: string;
}

/**
 * A base's dated floor (TABLET_ASK_FLOORS) beside poe.ninja's base-and-rarity
 * price; undefined where that rarity was not sampled. poe.ninja ran above
 * the asks for most, below for some ("asks 1.6× higher").
 */
export function askFloorText(
  base: string,
  rarity: string | undefined,
): string | undefined {
  const floors = TABLET_ASK_FLOORS[base];
  if (
    !floors ||
    (rarity !== "Normal" && rarity !== "Magic" && rarity !== "Rare")
  ) {
    return undefined;
  }
  const floor = floors[rarity];
  if (!floor) return undefined;
  const { ask, ninja } = floor;
  const compared =
    ninja >= ask
      ? `${(ninja / ask).toFixed(1)}× higher`
      : `asks ${(ask / ninja).toFixed(1)}× higher`;
  const ninjaDay =
    floors.ninjaAsOf && floors.ninjaAsOf !== floors.asOf
      ? ` on ${floors.ninjaAsOf}`
      : "";
  return `Cheapest asks in ex/div/chaos, ${floors.uses} uses, ${floors.asOf}: ${ask} div; poe.ninja had ${ninja.toPrecision(2)}${ninjaDay} (${compared})`;
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
  const summary: TabletSummary = {
    level: verdict.level,
    headline: verdict.text,
    detail:
      verdict.level === "none" && normalPrice
        ? `A Normal ${name} is ${normalPrice} on poe.ninja.`
        : note,
  };
  const combo = verdict.combos[0];
  if (combo) {
    summary.comboNote = `${combo.short}: ${combo.source}, ${combo.basis}. Asking prices, not sales.`;
  }
  const floor = askFloorText(name, rarity);
  if (floor) summary.floor = floor;
  return summary;
}
