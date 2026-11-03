// The default tablet search compares what sets the price (tabletRating.ts):
// rated mods and uses remaining stay ticked at the tablet's own values, so
// the listings are tablets at least as good; filler mods are unticked but
// left visible. Niche mods count only on a tablet with nothing better.
import type { StatFilter } from "../filters/interfaces";
import { tabletModRating } from "./tabletRating";

const USES_REMAINING = "# uses remaining";

export function applyTabletKeyMods(
  filters: StatFilter[],
  base: string,
  rarity: string | undefined,
): void {
  if (rarity !== "Magic" && rarity !== "Rare") return;
  const tierOf = (filter: StatFilter) =>
    tabletModRating(base, filter.statRef)?.tier;
  const hasCore = filters.some((filter) => {
    const tier = tierOf(filter);
    return tier !== undefined && tier !== "niche";
  });
  for (const filter of filters) {
    if (filter.statRef === USES_REMAINING) continue;
    const tier = tierOf(filter);
    filter.disabled = !(tier !== undefined && (tier !== "niche" || !hasCore));
  }
}
