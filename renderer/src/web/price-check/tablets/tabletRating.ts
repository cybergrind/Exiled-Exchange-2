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
    // 2026-11-24 market study (research/tablets/market-2026-11-24.md): extra
    // rerolls alone ask about 11 div, omen chance alone about 94 ex (both
    // money); the cost mods sell only in pairs (TABLET_COMBOS); more tribute
    // alone asks the base's floor and adds nothing.
    "Ritual Altars in Map allow rerolling Favours an additional time": rate(
      "money",
      "Favour rerolls",
      [1, 3],
    ),
    "Ritual Favours in Map have #% increased chance to be Omens": rate(
      "money",
      "Omen chance",
      [35, 70],
    ),
    "Rerolling Favours at Ritual Altars in Map costs #% increased Tribute":
      rate("multiplier", "Cheaper rerolls", [20, 30]),
    "Deferring Favours at Ritual Altars in Map costs #% increased Tribute":
      rate("multiplier", "Cheaper deferring", [20, 30]),
  },
  "Breach Tablet": {
    ...UNIVERSAL,
    // 2026-11-24 market study: Wombgifts alone ask about 130 ex (money);
    // stabilised rares and Hiveblood ask a little over the floor alone (good);
    // rare effectiveness and Wombgift level ask the floor alone and pay only
    // in pairs (TABLET_COMBOS).
    "Unstable Breaches in Map spawn an additional Rare Monster when Stabilised":
      rate("good", "Stabilised rares", [1, 2]),
    "#% increased Effectiveness of Rare Breach Monsters in Map": rate(
      "multiplier",
      "Rare Breach effectiveness",
      [5, 20],
    ),
    "Wombgifts have #% chance to drop one Level higher in Map": rate(
      "multiplier",
      "Wombgift level",
      [10, 30],
    ),
    "#% increased Quantity of Wombgifts found in Map": rate(
      "money",
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
    // 2026-11-24 market study: each mirror mod alone asks 5-31 ex, a pair
    // 1.6-2 div (TABLET_COMBOS); unique bosses alone ask 5 ex.
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
      rate("multiplier", "Unique bosses", [15, 30]),
  },
  "Abyss Tablet": {
    ...UNIVERSAL,
    // 2026-11-24 market study (research/tablets/abyss-market-2026-11-24.md,
    // from poe2-auto docs/market-research.html; 711 trade listings priced in
    // exalted/divine/chaos; the priced pairs are in TABLET_COMBOS below): only
    // Depths chance lifts a tablet alone (x3.3, about 0.6-1 div); value is in
    // pairs, Depths with Desecrated currency (2.6-4 div) and rare monsters +
    // Desecrated + Abyss rares (about 2 div). Four more Abysses, Abyssal
    // modifiers and Abyss rares add x1.1-1.4 at most; an extra Abyss adds
    // nothing.
    "Abysses in Map have #% increased chance to lead to an Abyssal Depths":
      rate("money", "Abyssal Depths", [10, 20]),
    "Map has #% chance to contain four additional Abysses": rate(
      "multiplier",
      "Four more Abysses",
      [20, 40],
    ),
    "#% increased chance for Abyssal monsters in Map to have Abyssal Modifiers":
      rate("multiplier", "Abyssal modifiers", [20, 30]),
    "# additional Rare Monsters are spawned from Abysses in Map": rate(
      "multiplier",
      "Abyss rares",
      [2, 3],
    ),
    "Map contains # additional Abysses": rate("niche", "Extra Abyss"),
    "Abyss Pits in Map are twice as likely to have Rewards": rate(
      "good",
      "Pit rewards",
    ),
    // 2026-11-18 refresh (research/tablets/abyss-2026-11.md): the Trove/Cranium
    // farm pairs pit rewards with Desecrated currency (the 2026-11-24 study
    // agrees: that pair x3.6); the Omen of Light farm wants rare monsters and
    // a Rogue Exile next to abyssal modifiers.
    "#% increased chance for Desecrated Currency from Abysses in Map": rate(
      "good",
      "Desecrated currency",
      [20, 30],
    ),
    "Map has #% increased number of Rare Monsters": rate(
      "good",
      "Rare monsters",
      [25, 35],
    ),
    "Map is inhabited by # additional Rogue Exile": rate(
      "multiplier",
      "Rogue Exile",
    ),
  },
  "Irradiated Tablet": {
    ...UNIVERSAL,
    // 2026-11-24 market study: waystones alone ask the floor (15-25 ex), so
    // the universal multiplier; random map mods ask 2.3 div here
    // (TABLET_COMBOS).
  },
  "Overseer Tablet": {
    ...UNIVERSAL,
    // 2026-11-24 market study: boss waystones and boss quantity alone ask
    // 21-31 ex, the floor; they pay with map waystones (TABLET_COMBOS).
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
      "multiplier",
      "Boss waystones",
      [18, 30],
    ),
    "#% increased Quantity of Items dropped by Map Bosses": rate(
      "multiplier",
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
    // 2026-11-24 market study: sentries, bosses in ice, runic passover and
    // duplicate runic monsters alone ask 15-20 ex, the floor; they pay next to
    // the Remnant or each other (TABLET_COMBOS).
    "Expeditions have #% Surpassing chance to contain an additional Verisium Remnant":
      rate("money", "Extra Remnant", [30, 40]),
    "Verisium Remnants have #% chance to add an additional Runic Modifier in Map":
      rate("multiplier", "Runic Modifier", [25, 35]),
    "Expeditions contain 1 Additional Verisium Sentry in Map": rate(
      "multiplier",
      "Verisium Sentries",
      [1, 2],
    ),
    "Expeditions contain 1 Additional Boss encased in ice in Map": rate(
      "multiplier",
      "Bosses in ice",
      [1, 2],
    ),
    "Expeditions have #% Surpassing chance to Duplicate Runic Monsters in Map":
      rate("multiplier", "Duplicate Runic Monsters", [30, 40]),
    "#% increased Expedition Explosive Area of Effect in Map": rate(
      "niche",
      "Explosive area",
      [5, 10],
    ),
  },
  "Temple Tablet": {
    ...UNIVERSAL,
    // 2026-11-24 market study: an extra crystal alone asks about 4 div
    // (money); the unique monster mod alone asks about 13 div here
    // (TABLET_COMBOS).
    "#% chance to gain an additional Crystal from Vaal Beacons in Map": rate(
      "money",
      "Extra Crystal",
      [5, 10],
    ),
    "Unique Monsters have # additional Rare Modifier": rate(
      "good",
      "Unique monster rare mod",
    ),
  },
};

/**
 * A set of mods with a price read off the trade site, one mod or several.
 * Asking prices, not sales: the cheapest asks by seller, in divines.
 */
export interface TabletCombo {
  /** stats.ndjson refs; the tablet needs every one. */
  refs: string[];
  /** A few words for the verdict line. */
  short: string;
  /** About what such a tablet asks, in divines. */
  div: number;
  /** "measured": searched as a set; "model only": a regression effect. */
  source: "measured" | "model only";
  /** The rarity the asks were read on; others are not priced. */
  rarity: "Rare";
  /** The day of the asks. */
  asOf: string;
  /** What the price rests on, for a tooltip. */
  basis: string;
}

const ABYSS_DEPTHS =
  "Abysses in Map have #% increased chance to lead to an Abyssal Depths";
const ABYSS_DESECRATED =
  "#% increased chance for Desecrated Currency from Abysses in Map";

const RANDOM_MOD = "Map has # additional random Modifier";
const UNIQUE_RARE_MOD = "Unique Monsters have # additional Rare Modifier";
const SUMMONING_CIRCLE = "Map contains an additional Summoning Circle";
const RITUAL_REROLL =
  "Ritual Altars in Map allow rerolling Favours an additional time";
const RITUAL_OMENS =
  "Ritual Favours in Map have #% increased chance to be Omens";
const RITUAL_REROLL_COST =
  "Rerolling Favours at Ritual Altars in Map costs #% increased Tribute";
const RITUAL_DEFER_COST =
  "Deferring Favours at Ritual Altars in Map costs #% increased Tribute";
const EXPEDITION_REMNANT =
  "Expeditions have #% Surpassing chance to contain an additional Verisium Remnant";
const DELIRIUM_MIRRORS =
  "Delirium Fog in Map spawns #% increased Fracturing Mirrors";
const BREACH_RARES =
  "Unstable Breaches in Map spawn an additional Rare Monster when Stabilised";
const BREACH_HIVEBLOOD = "#% increased Quantity of Hiveblood found in Map";
const BREACH_WOMBGIFTS = "#% increased Quantity of Wombgifts found in Map";
const TEMPLE_CRYSTAL =
  "#% chance to gain an additional Crystal from Vaal Beacons in Map";

/** A set from a 2026-11-24 market study: measured on rare tablets. */
const asked = (
  refs: string[],
  short: string,
  div: number,
  basis: string,
): TabletCombo => ({
  refs,
  short,
  div,
  source: "measured",
  rarity: "Rare",
  asOf: "2026-11-24",
  basis,
});

/**
 * Keyed by base type. The 2026-11-24 market studies, asks in exalted, divine
 * or chaos on rare tablets: Abyss in research/tablets/abyss-market-2026-11-24.md
 * (711 asks), the other six bases in research/tablets/market-2026-11-24.md
 * (T-8). Mod ids map to refs through research/tablets/mod-pool.json. poe2-auto
 * keeps the same sets in its own tablets.toml; its sync reads only
 * TABLET_RATINGS from here.
 */
export const TABLET_COMBOS: Record<string, TabletCombo[]> = {
  "Abyss Tablet": [
    {
      refs: [ABYSS_DEPTHS, ABYSS_DESECRATED],
      short: "Depths + Desecrated",
      div: 3,
      source: "measured",
      rarity: "Rare",
      asOf: "2026-11-24",
      basis: "698 listed, 2.6 div cheapest, 3.7 div by the 5th seller",
    },
    {
      refs: [
        "Map has #% increased number of Rare Monsters",
        ABYSS_DESECRATED,
        "# additional Rare Monsters are spawned from Abysses in Map",
      ],
      short: "Rare monsters + Desecrated + Abyss rares",
      div: 2,
      source: "measured",
      rarity: "Rare",
      asOf: "2026-11-24",
      basis: "113 listed, 1.8 div cheapest, 2.0 div by the 5th seller",
    },
    {
      refs: [
        ABYSS_DESECRATED,
        "Abyss Pits in Map are twice as likely to have Rewards",
      ],
      short: "Desecrated + Pit rewards",
      div: 1.5,
      source: "model only",
      rarity: "Rare",
      asOf: "2026-11-24",
      basis:
        "the regression's x3.6 effect for the pair (12 rows); never searched as a pair",
    },
    {
      refs: [ABYSS_DEPTHS],
      short: "Depths chance",
      div: 0.6,
      source: "measured",
      rarity: "Rare",
      asOf: "2026-11-24",
      basis: "8,859 listed; one bulk seller at 281 ex, 1 div by the 5th seller",
    },
  ],
  "Ritual Tablet": [
    asked(
      [RITUAL_REROLL, RITUAL_OMENS],
      "Favour rerolls + Omen chance",
      55,
      "157 listed, 40 div cheapest, 60 div by the 5th seller",
    ),
    asked(
      [RITUAL_OMENS, RITUAL_REROLL_COST],
      "Omen chance + Cheaper rerolls",
      1,
      "2,649 listed, 1 div from the cheapest",
    ),
    asked(
      [RITUAL_REROLL_COST, RITUAL_DEFER_COST],
      "Cheaper rerolls + Cheaper deferring",
      0.17,
      "2,177 listed, 25 ex cheapest, 80 ex by the 5th seller",
    ),
    asked(
      [RITUAL_REROLL],
      "Favour rerolls",
      11,
      "4,075 listed, 9 div cheapest, 11 div by the 5th seller",
    ),
    asked(
      [RITUAL_OMENS],
      "Omen chance",
      0.2,
      "18,282 listed, 62 ex cheapest, 94 ex by the 5th seller",
    ),
  ],
  "Expedition Tablet": [
    asked(
      [EXPEDITION_REMNANT, RANDOM_MOD],
      "Extra Remnant + Random map mods",
      200,
      "61 listed, 120 div cheapest, 200 div by the 5th seller",
    ),
    asked(
      [
        EXPEDITION_REMNANT,
        "Verisium Remnants have #% chance to add an additional Runic Modifier in Map",
      ],
      "Extra Remnant + Runic Modifier",
      20,
      "272 listed, 15 div cheapest, 23 div by the 5th seller",
    ),
    asked(
      [EXPEDITION_REMNANT, "Monsters have #% increased Effectiveness"],
      "Extra Remnant + Monster effectiveness",
      3,
      "2,973 listed, 1 div cheapest, 3 div by the 5th seller",
    ),
    asked(
      [RANDOM_MOD],
      "Random map mods",
      2,
      "6,087 listed, 2 div from the cheapest",
    ),
    asked(
      [
        "Expeditions contain 1 Additional Verisium Sentry in Map",
        "Expeditions contain 1 Additional Boss encased in ice in Map",
      ],
      "Verisium Sentries + Bosses in ice",
      0.12,
      "683 listed, 30 ex cheapest, 59 ex by the 5th seller",
    ),
    asked(
      [EXPEDITION_REMNANT],
      "Extra Remnant",
      1,
      "10,440 listed, 468 ex cheapest, 1 div by the 10th seller",
    ),
  ],
  "Delirium Tablet": [
    asked(
      [
        DELIRIUM_MIRRORS,
        "Delirium Fog in Map spawns #% increased Mirror Shards",
      ],
      "Fracturing Mirrors + Mirror Shards",
      2,
      "547 listed, 1 div cheapest, 2 div by the 5th seller",
    ),
    asked(
      [
        DELIRIUM_MIRRORS,
        "#% increased Stack size of Simulacrum Splinters found in Map",
      ],
      "Fracturing Mirrors + Splinter stacks",
      1.6,
      "1,749 listed, one seller at 31 ex, 1.6 div by the 5th seller",
    ),
  ],
  "Breach Tablet": [
    asked(
      [BREACH_HIVEBLOOD, BREACH_WOMBGIFTS],
      "Hiveblood + Wombgifts",
      6,
      "2,078 listed, 5 div cheapest, 7 div by the 5th seller",
    ),
    asked(
      [BREACH_RARES, BREACH_HIVEBLOOD],
      "Stabilised rares + Hiveblood",
      2,
      "894 listed, 1 div cheapest, 2 div by the 5th seller",
    ),
    asked(
      [
        "Wombgifts have #% chance to drop one Level higher in Map",
        BREACH_WOMBGIFTS,
      ],
      "Wombgift level + Wombgifts",
      1,
      "1,010 listed, 1 div from the cheapest",
    ),
    asked(
      [
        BREACH_RARES,
        "#% increased Effectiveness of Rare Breach Monsters in Map",
      ],
      "Stabilised rares + Rare Breach effectiveness",
      0.3,
      "1,813 listed, 45 ex cheapest, 150 ex by the 5th seller",
    ),
    asked(
      [BREACH_WOMBGIFTS],
      "Wombgifts",
      0.25,
      "9,053 listed, 100 ex cheapest, 130 ex by the 5th seller",
    ),
  ],
  "Overseer Tablet": [
    // Measured on the Overseer's own suffixes (TowerMapBossAdditionalSpirit,
    // TowerMapBossAdditionalStrongbox, 1-2 each). The generic prefix
    // TowerAdditionalAzmeriWisp1 and suffix TowerAdditionalStrongbox1 (1 each)
    // have other trade ids but the same stats.ndjson lines; matching is by
    // ref, so a tablet with those matches this set too.
    asked(
      [
        "Map contains # additional Azmeri Spirit",
        "Map contains # additional Strongboxes",
      ],
      "Azmeri Spirits + Strongboxes",
      60,
      "19 listed at any roll, 60 div cheapest, 496 div by the 5th seller; " +
        "measured on the Overseer's own 1-2 suffixes, but the generic 1-only " +
        "Azmeri Spirit and Strongbox mods share their stat lines and match too",
    ),
    asked(
      [UNIQUE_RARE_MOD, SUMMONING_CIRCLE],
      "Unique monster rare mod + Summoning Circle",
      9,
      "48 listed, 2 div cheapest, 9 div by the 5th seller",
    ),
    asked(
      [
        "#% increased Quantity of Waystones dropped by Map Bosses",
        "#% increased Quantity of Waystones found in Map",
      ],
      "Boss waystones + Waystones",
      5,
      "758 listed, 4 div cheapest, 6 div by the 5th seller",
    ),
    asked(
      [RANDOM_MOD],
      "Random map mods",
      1,
      "1,535 listed, 156 ex cheapest, 468 ex by the 5th seller, 1 div by the 10th",
    ),
  ],
  "Temple Tablet": [
    asked(
      [UNIQUE_RARE_MOD],
      "Unique monster rare mod",
      13,
      "216 listed, 6 div cheapest, 13 div by the 5th seller",
    ),
    asked(
      [TEMPLE_CRYSTAL, UNIQUE_RARE_MOD],
      "Extra Crystal + Unique monster rare mod",
      12,
      "26 listed, 12 div cheapest, 19 div by the 5th seller",
    ),
    asked(
      [TEMPLE_CRYSTAL],
      "Extra Crystal",
      4,
      "2,213 listed, 3.3 div cheapest, 4 div by the 5th seller",
    ),
  ],
  "Irradiated Tablet": [
    asked(
      [RANDOM_MOD],
      "Random map mods",
      2.3,
      "8,210 listed, 1.3 div cheapest, 2.3 div by the 5th seller",
    ),
    asked(
      [UNIQUE_RARE_MOD, SUMMONING_CIRCLE],
      "Unique monster rare mod + Summoning Circle",
      1,
      "302 listed, 375 ex cheapest, 468 ex by the 5th seller, 1 div by the 10th",
    ),
  ],
};

/** The cheapest real-currency ask beside poe.ninja's price, in divines. */
export interface TabletAskFloor {
  ask: number;
  ninja: number;
}

/** One base's floors; a rarity nobody sampled has none. */
export interface TabletAskFloors {
  asOf: string;
  /** The day of the poe.ninja figures, when not `asOf`. */
  ninjaAsOf?: string;
  uses: number;
  Normal?: TabletAskFloor;
  Magic?: TabletAskFloor;
  Rare?: TabletAskFloor;
}

/** A T-8 base: asks of 2026-11-24, poe.ninja as poe2-auto had it 2026-11-22. */
const floors = (
  normal: TabletAskFloor | undefined,
  magic: TabletAskFloor,
  rare: TabletAskFloor,
): TabletAskFloors => ({
  asOf: "2026-11-24",
  ninjaAsOf: "2026-11-22",
  uses: 10,
  ...(normal ? { Normal: normal } : {}),
  Magic: magic,
  Rare: rare,
});

/**
 * Keyed by base type: cheapest real-currency asks with 10 uses, by rarity,
 * beside poe.ninja's base-and-rarity price (2026-11-24 market studies; the
 * poe.ninja figures for the six T-8 bases are poe2-auto's of 2026-11-22,
 * `ninjaAsOf`).
 * Overseer had no normal tablet listed; Temple's normal was not sampled.
 * The asks run above poe.ninja for some (Irradiated normal and magic,
 * Expedition and Breach magic).
 */
export const TABLET_ASK_FLOORS: Record<string, TabletAskFloors> = {
  // The Abyss study read poe.ninja the same day.
  "Abyss Tablet": {
    asOf: "2026-11-24",
    uses: 10,
    Normal: { ask: 0.3, ninja: 0.4585 },
    Magic: { ask: 0.42, ninja: 0.4585 },
    Rare: { ask: 0.45, ninja: 0.7336 },
  },
  "Ritual Tablet": floors(
    { ask: 0.15, ninja: 0.365 },
    { ask: 0.05, ninja: 0.2568 },
    { ask: 0.04, ninja: 0.055 },
  ),
  "Expedition Tablet": floors(
    { ask: 0.15, ninja: 0.2531 },
    { ask: 0.06, ninja: 0.0367 },
    { ask: 0.02, ninja: 0.0367 },
  ),
  "Delirium Tablet": floors(
    { ask: 0.015, ninja: 0.055 },
    { ask: 0.012, ninja: 0.0183 },
    { ask: 0.006, ninja: 0.0183 },
  ),
  "Breach Tablet": floors(
    { ask: 0.14, ninja: 0.1651 },
    { ask: 0.045, ninja: 0.0367 },
    { ask: 0.04, ninja: 0.0917 },
  ),
  "Overseer Tablet": floors(
    undefined,
    { ask: 0.008, ninja: 0.0183 },
    { ask: 0.025, ninja: 0.0734 },
  ),
  "Temple Tablet": floors(
    undefined,
    { ask: 0.33, ninja: 0.5997 },
    { ask: 0.45, ninja: 0.7336 },
  ),
  "Irradiated Tablet": floors(
    { ask: 0.2, ninja: 0.11 },
    { ask: 0.08, ninja: 0.0734 },
    { ask: 0.03, ninja: 0.0917 },
  ),
};

/** The priced sets a tablet has every mod of, dearest first. */
export function tabletCombos(
  base: string,
  rarity: string | undefined,
  mods: readonly TabletModInput[],
): TabletCombo[] {
  const refs = new Set(mods.map((mod) => mod.statRef));
  return (TABLET_COMBOS[base] ?? [])
    .filter(
      (combo) =>
        combo.rarity === rarity && combo.refs.every((ref) => refs.has(ref)),
    )
    .sort((a, b) => b.div - a.div);
}

/** "Depths + Desecrated: ~3 div (asks, 2026-11-24)". */
export function comboText(combo: TabletCombo): string {
  const source = combo.source === "measured" ? "asks" : "model only";
  return `${combo.short}: ~${combo.div} div (${source}, ${combo.asOf})`;
}

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
  /** The tier verdict, then the dearest priced set the tablet has. */
  text: string;
  /** The tablet's rated mods, most valued first. */
  rated: RatedTabletMod[];
  /** Priced sets (TABLET_COMBOS) the tablet has, dearest first. */
  combos: TabletCombo[];
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
  const verdict = tierVerdict(base, mods);
  const combos = tabletCombos(base, rarity, mods);
  const text = combos.length
    ? `${verdict.text} · ${comboText(combos[0])}`
    : verdict.text;
  return { ...verdict, text, combos };
}

function tierVerdict(
  base: string,
  mods: readonly TabletModInput[],
): Omit<TabletVerdict, "combos"> {
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
