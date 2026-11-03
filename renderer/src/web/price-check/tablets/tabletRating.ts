// Which tablet mods players pay for (research/tablets/values.md, mod texts
// and ranges from research/tablets/mod-pool.json). poe.ninja prices a tablet
// by base and rarity only; this rates the mods so the price check can
// highlight them. Pure and Node-runnable: no Vue, no `@/`.

export type TabletTier = "money" | "good" | "multiplier" | "niche";

export const TIER_LABEL: Record<TabletTier, string> = {
  money: "Always money",
  good: "Good",
  multiplier: "Multiplier",
  niche: "Niche",
};

export interface TabletModRating {
  tier: TabletTier;
  /** A few words for the verdict line. */
  short: string;
  /** The roll range, by size: a "reduced" roll is read as positive. */
  range?: [number, number];
}

type Ratings = Record<string, TabletModRating>;

const rate = (
  tier: TabletTier,
  short: string,
  range?: [number, number],
): TabletModRating => (range ? { tier, short, range } : { tier, short });

// On every base (patch 0.5.5, values.md "Any tablet"). Random map mods are
// the top universal roll; the multipliers scale what the tablet's own
// mechanic drops; experience and shrines sell to levelling players only.
const RANDOM_MODS: Ratings = {
  "Map has # additional random Modifier": rate(
    "money",
    "Random map mods",
    [1, 2],
  ),
};
const MULTIPLIERS: Ratings = {
  "Monsters have #% increased Effectiveness": rate(
    "multiplier",
    "Monster effectiveness",
    [10, 15],
  ),
  "Map has #% increased number of Rare Monsters": rate(
    "multiplier",
    "Rare monsters",
    [25, 35],
  ),
  "Map has #% increased Monster Rarity": rate(
    "multiplier",
    "Monster rarity",
    [15, 20],
  ),
  "#% increased Rarity of Items found": rate(
    "multiplier",
    "Item rarity",
    [8, 12],
  ),
  "#% increased Quantity of Waystones found in Map": rate(
    "multiplier",
    "Waystones",
    [30, 40],
  ),
};
const NICHE: Ratings = {
  "#% increased Experience gain": rate("niche", "Experience", [12, 18]),
  "Map contains an additional Shrine": rate("niche", "Shrine"),
};
const UNIVERSAL: Ratings = { ...MULTIPLIERS, ...NICHE, ...RANDOM_MODS };

/**
 * Keyed by base type, then by stats.ndjson `ref`; a base's own entries win
 * over the universal ones. Rerolls before 0.5.5 (the video's board) are
 * superseded where values.md says so: Breach's stabilised rares are good, not
 * always money; Rogue Exile is no longer good.
 */
export const TABLET_RATINGS: Record<string, Ratings> = {
  "Ritual Tablet": {
    ...UNIVERSAL,
    "Ritual Altars in Map allow rerolling Favours an additional time": rate(
      "money",
      "Favour rerolls",
      [1, 3],
    ),
    "Ritual Favours in Map have #% increased chance to be Omens": rate(
      "good",
      "Omen chance",
      [35, 70],
    ),
    "Rerolling Favours at Ritual Altars in Map costs #% increased Tribute":
      rate("good", "Cheaper rerolls", [20, 30]),
    "Deferring Favours at Ritual Altars in Map costs #% increased Tribute":
      rate("good", "Cheaper deferring", [20, 30]),
    "Monsters Sacrificed at Ritual Altars in Map grant #% increased Tribute":
      rate("multiplier", "More tribute", [18, 30]),
  },
  "Breach Tablet": {
    ...UNIVERSAL,
    "Unstable Breaches in Map spawn an additional Rare Monster when Stabilised":
      rate("good", "Stabilised rares", [1, 2]),
    "#% increased Effectiveness of Rare Breach Monsters in Map": rate(
      "good",
      "Rare Breach effectiveness",
      [5, 20],
    ),
    "Wombgifts have #% chance to drop one Level higher in Map": rate(
      "good",
      "Wombgift level",
      [10, 30],
    ),
    "#% increased Quantity of Wombgifts found in Map": rate(
      "good",
      "Wombgifts",
      [30, 60],
    ),
    "#% increased Quantity of Hiveblood found in Map": rate(
      "good",
      "Hiveblood",
      [30, 60],
    ),
  },
  "Delirium Tablet": {
    ...UNIVERSAL,
    "Delirium Fog in Map spawns #% increased Fracturing Mirrors": rate(
      "good",
      "Fracturing Mirrors",
      [15, 30],
    ),
    "#% increased Stack size of Simulacrum Splinters found in Map": rate(
      "good",
      "Splinter stacks",
      [15, 30],
    ),
    "Delirium Fog in Map spawns #% increased Mirror Shards": rate(
      "good",
      "Mirror Shards",
      [12, 26],
    ),
    "Delirium Encounters in Map are #% more likely to spawn Unique Bosses":
      rate("good", "Unique bosses", [15, 30]),
  },
  "Abyss Tablet": {
    ...UNIVERSAL,
    "Map has #% chance to contain four additional Abysses": rate(
      "good",
      "Four more Abysses",
      [20, 40],
    ),
    "#% increased chance for Abyssal monsters in Map to have Abyssal Modifiers":
      rate("good", "Abyssal modifiers", [20, 30]),
    "# additional Rare Monsters are spawned from Abysses in Map": rate(
      "good",
      "Abyss rares",
      [2, 3],
    ),
    "Map contains # additional Abysses": rate("good", "Extra Abyss"),
    "Abyss Pits in Map are twice as likely to have Rewards": rate(
      "good",
      "Pit rewards",
    ),
    "Abyssal Monsters have #% increased Effectiveness for each closed Pit, up to 100%":
      rate("good", "Pit effectiveness", [8, 12]),
  },
  "Irradiated Tablet": {
    ...UNIVERSAL,
    "#% increased Quantity of Waystones found in Map": rate(
      "good",
      "Waystones",
      [30, 40],
    ),
  },
  "Overseer Tablet": {
    ...UNIVERSAL,
    "Map contains # additional Azmeri Spirit": rate(
      "good",
      "Azmeri Spirits",
      [1, 2],
    ),
    "Map contains # additional Strongboxes": rate(
      "good",
      "Strongboxes",
      [1, 2],
    ),
    "#% increased Quantity of Waystones dropped by Map Bosses": rate(
      "good",
      "Boss waystones",
      [18, 30],
    ),
    "#% increased Quantity of Items dropped by Map Bosses": rate(
      "good",
      "Boss quantity",
      [13, 20],
    ),
    "#% increased Rarity of Items dropped by Map Bosses": rate(
      "good",
      "Boss rarity",
      [35, 60],
    ),
    "Unique Monsters have # additional Rare Modifier": rate(
      "good",
      "Unique monster rare mod",
    ),
    "Map contains an additional Summoning Circle": rate(
      "good",
      "Summoning Circle",
    ),
  },
  "Expedition Tablet": {
    ...UNIVERSAL,
    "Expeditions have #% Surpassing chance to contain an additional Verisium Remnant":
      rate("money", "Extra Remnant", [30, 40]),
    "Verisium Remnants have #% chance to add an additional Runic Modifier in Map":
      rate("good", "Runic Modifier", [25, 35]),
    "Expeditions contain 1 Additional Verisium Sentry in Map": rate(
      "good",
      "Verisium Sentries",
      [1, 2],
    ),
    "Expeditions contain 1 Additional Boss encased in ice in Map": rate(
      "good",
      "Bosses in ice",
      [1, 2],
    ),
    "Expeditions have #% Surpassing chance to Duplicate Runic Monsters in Map":
      rate("good", "Duplicate Runic Monsters", [30, 40]),
    "#% increased Expedition Explosive Area of Effect in Map": rate(
      "niche",
      "Explosive area",
      [5, 10],
    ),
  },
  "Temple Tablet": {
    ...UNIVERSAL,
    "#% chance to gain an additional Crystal from Vaal Beacons in Map": rate(
      "good",
      "Extra Crystal",
      [5, 10],
    ),
    "Unique Monsters have # additional Rare Modifier": rate(
      "good",
      "Unique monster rare mod",
    ),
  },
};

export interface TabletModInput {
  statRef: string;
  /** The rolled value, if the filter has one. */
  value?: number;
}

export interface RatedTabletMod extends TabletModRating {
  statRef: string;
  /** Where the roll sits in its range, 0..1, when both are known. */
  roll?: number;
}

export type TabletVerdictLevel =
  | "money"
  | "combo"
  | "good"
  | "multiplier"
  | "niche"
  | "none";

export interface TabletVerdict {
  level: TabletVerdictLevel;
  text: string;
  /** The tablet's rated mods, most valued first. */
  rated: RatedTabletMod[];
}

export function tabletModRating(
  base: string,
  statRef: string,
): TabletModRating | undefined {
  return TABLET_RATINGS[base]?.[statRef];
}

/** Where a roll sits in the mod's range, 0..1; undefined without both. */
export function rollPosition(
  rating: TabletModRating,
  value: number | undefined,
): number | undefined {
  if (!rating.range || value === undefined) return undefined;
  const [min, max] = rating.range;
  if (max === min) return 1;
  const position = (Math.abs(value) - min) / (max - min);
  return Math.min(1, Math.max(0, position));
}

const TIER_ORDER: Record<TabletTier, number> = {
  money: 0,
  good: 1,
  multiplier: 2,
  niche: 3,
};

/**
 * The verdict for a magic or rare tablet; undefined for other rarities, whose
 * mods do not set the price. The order follows "well-rolled rare/magic >
 * normal > magic > rare": an unrated magic or rare sells below a normal one.
 */
export function rateTablet(
  base: string,
  rarity: string | undefined,
  mods: readonly TabletModInput[],
): TabletVerdict | undefined {
  if (rarity !== "Magic" && rarity !== "Rare") return undefined;
  const rated = mods
    .flatMap((mod): RatedTabletMod[] => {
      const rating = tabletModRating(base, mod.statRef);
      if (!rating) return [];
      const roll = rollPosition(rating, mod.value);
      return [
        {
          ...rating,
          statRef: mod.statRef,
          ...(roll === undefined ? {} : { roll }),
        },
      ];
    })
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  const names = (tier: TabletTier) =>
    rated.filter((mod) => mod.tier === tier).map((mod) => mod.short);
  const money = names("money");
  const good = names("good");
  const multipliers = names("multiplier");

  if (money.length) {
    return { level: "money", text: `Always money: ${money.join(", ")}`, rated };
  }
  // The badges name every mod; the verdict counts multipliers past one.
  const multiplierText =
    multipliers.length > 1
      ? [`${multipliers.length} multipliers`]
      : multipliers;
  if (good.length && (multipliers.length || good.length > 1)) {
    return {
      level: "combo",
      text: `Well rolled: ${[...good, ...multiplierText].join(" + ")}`,
      rated,
    };
  }
  if (good.length) {
    return { level: "good", text: `Good mod: ${good[0]}`, rated };
  }
  if (multipliers.length) {
    return {
      level: "multiplier",
      text: `Multiplier only: ${multiplierText.join(" + ")}`,
      rated,
    };
  }
  const niche = names("niche");
  if (niche.length) {
    return {
      level: "niche",
      text: `Niche: ${niche.join(" + ")}, for levelling buyers`,
      rated,
    };
  }
  return {
    level: "none",
    text: `No valued mods: usually worth less than a Normal ${base}`,
    rated,
  };
}
