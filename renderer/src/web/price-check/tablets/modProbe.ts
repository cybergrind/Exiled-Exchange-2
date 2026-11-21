// "Value the mods" (guide/tablets.html T-6): on a tablet price check the user
// asks for, search once with every rated mod ticked, then once with each
// rated mod dropped. The gap between the floors is what that mod adds to
// this tablet. Searches are capped (user decision, 2026-11-20: at most 5 per
// press) and ask only for fresh listings from online sellers: a cheap tablet
// worth having does not stay listed long, so old listings are left out.
// Pure and Node-runnable: no Vue, no `@/`.
import type { ItemFilters, StatFilter } from "../filters/interfaces";
import { tabletModRating } from "./tabletRating";
import type { TabletTier } from "./tabletRating";

/** Per button press, including the search with every rated mod. */
export const PROBE_MAX_SEARCHES = 5;
/** The trade site's "listed within" option for probe searches. */
export const PROBE_LISTED = "1week";

const TIER_ORDER: Record<TabletTier, number> = {
  money: 0,
  good: 1,
  multiplier: 2,
  niche: 3,
};

export interface ModProbe {
  /** The rated mod left out; undefined for the search with all of them. */
  dropped?: string;
  stats: StatFilter[];
}

/**
 * The searches for one press: all ticked rated mods first, then one per
 * rated mod with it unticked, most valuable tier first, within the cap.
 * Only ever unticks: a mod the user left unticked stays unticked.
 */
export function planModProbe(
  base: string,
  stats: readonly StatFilter[],
): ModProbe[] | undefined {
  const rated = stats
    .filter((s) => !s.disabled)
    .map((s) => ({ ref: s.statRef, rating: tabletModRating(base, s.statRef) }))
    .filter(
      (r): r is { ref: string; rating: NonNullable<typeof r.rating> } =>
        r.rating !== undefined,
    );
  if (!rated.length) return undefined;
  const order = rated
    .map((r, i) => ({ ...r, i }))
    .sort(
      (a, b) =>
        TIER_ORDER[a.rating.tier] - TIER_ORDER[b.rating.tier] || a.i - b.i,
    )
    .slice(0, PROBE_MAX_SEARCHES - 1);
  const copy = (drop?: string) =>
    stats.map((s) =>
      s.statRef === drop && !s.disabled ? { ...s, disabled: true } : { ...s },
    );
  return [
    { stats: copy() },
    ...order.map((r) => ({ dropped: r.ref, stats: copy(r.ref) })),
  ];
}

/** The trade settings for a probe search: fresh, online, any currency. */
export function probeTrade(trade: ItemFilters["trade"]): ItemFilters["trade"] {
  return {
    ...trade,
    offline: false,
    listingType: "online",
    listed: PROBE_LISTED,
    currency: undefined,
  };
}

export interface ModValue {
  statRef: string;
  short: string;
  tier: TabletTier;
  /** The floor without this mod, in divines. */
  floorWithout?: number;
  /** floorAll − floorWithout, never below 0. */
  adds?: number;
  /** floorAll / floorWithout, never below 1. */
  multiplier?: number;
}

/** `floors` follows `plan`: the first is the floor with every rated mod. */
export function modValues(
  base: string,
  plan: readonly ModProbe[],
  floors: readonly (number | undefined)[],
): { floorAll?: number; mods: ModValue[] } {
  const floorAll = floors[0];
  const mods = plan.slice(1).map((probe, i): ModValue => {
    const rating = tabletModRating(base, probe.dropped!)!;
    const floorWithout = floors[i + 1];
    const value: ModValue = {
      statRef: probe.dropped!,
      short: rating.short,
      tier: rating.tier,
      floorWithout,
    };
    if (
      floorAll !== undefined &&
      floorWithout !== undefined &&
      floorWithout > 0
    ) {
      value.adds = Math.max(0, floorAll - floorWithout);
      value.multiplier = Math.max(1, floorAll / floorWithout);
    }
    return value;
  });
  return { floorAll, mods };
}
