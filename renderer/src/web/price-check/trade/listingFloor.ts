// Where the live listings start against poe.ninja's price. poe.ninja's
// unique and tablet lines come from stash listings it samples; on thin or
// swinging lines they can sit far from what the trade site shows (The Fall
// of the Axe: 370 ex on poe.ninja, a month of unsold Instant buyouts at
// 150 ex). Pure: no Vue, no `@/`.

/** The cheapest listings the floor is read from. */
export const FLOOR_SAMPLE = 5;
/** Fewer priced listings than this: no floor. */
export const FLOOR_MIN_LISTINGS = 3;
/** The floor this far under poe.ninja (ratio) is worth a note... */
export const FLOOR_BELOW = 0.6;
/** ...and this far over it. */
export const FLOOR_ABOVE = 1.67;

/**
 * The median of the first FLOOR_SAMPLE priced listings (results come
 * cheapest first), so one troll listing does not set it.
 */
export function listingFloor(
  values: readonly (number | undefined)[],
): number | undefined {
  const priced = values
    .filter((v): v is number => v !== undefined && v > 0)
    .slice(0, FLOOR_SAMPLE);
  if (priced.length < FLOOR_MIN_LISTINGS) return undefined;
  const sorted = [...priced].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export interface FloorGap {
  /** Both in divines. */
  floor: number;
  ninja: number;
  /** floor / ninja. */
  ratio: number;
  direction: "below" | "above";
}

/** Undefined while the floor and poe.ninja roughly agree. */
export function floorGap(
  values: readonly (number | undefined)[],
  ninja: number | undefined,
): FloorGap | undefined {
  const floor = listingFloor(values);
  if (floor === undefined || ninja === undefined || !(ninja > 0)) return;
  const ratio = floor / ninja;
  if (ratio <= FLOOR_BELOW) return { floor, ninja, ratio, direction: "below" };
  if (ratio >= FLOOR_ABOVE) return { floor, ninja, ratio, direction: "above" };
  return undefined;
}

/** The note under the listings; prices already formatted. */
export function floorGapText(
  gap: FloorGap,
  floorText: string,
  ninjaText: string,
): string {
  if (gap.direction === "below") {
    const pct = Math.round((1 - gap.ratio) * 100);
    return `Listings start at ${floorText}, ${pct}% under poe.ninja's ${ninjaText}. poe.ninja's price is likely too high; price from the listings.`;
  }
  const times = gap.ratio.toFixed(1);
  return `Listings start at ${floorText}, ${times}× poe.ninja's ${ninjaText}. Your filters may be narrower than poe.ninja's line, or these sellers ask too much.`;
}

/**
 * The note when poe.ninja has no line for an item it would normally price
 * (Murkshaft, a unique quiver with 576 listings, has none): the listings are
 * then the only price there is.
 */
export function noNinjaText(floorText: string): string {
  return `poe.ninja has no price for this item. Listings start at ${floorText} (the middle of the 5 cheapest).`;
}
