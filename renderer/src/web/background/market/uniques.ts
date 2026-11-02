// Unique lines from poe.ninja's stash overview (guide/poe-source.html, D7,
// WP-50 and WP-51): parse and trim one type's response, merge per type so a
// failed type keeps its last good lines, and group a unique's variants with
// their multiple and confidence. Pure: the caller fetches.
//
// Erasable TypeScript, no imports at all: plain Node runs it (the CLI), and
// main may bundle snapshot.ts, which imports this file's types.

/**
 * The stash overview's unique types, checked live on 2026-11-02 (743 lines
 * over 9 types including PrecursorTablets). The 8 types below hold all 719
 * unique lines.
 */
export const UNIQUE_TYPES = [
  "UniqueWeapons",
  "UniqueArmours",
  "UniqueAccessories",
  "UniqueFlasks",
  "UniqueCharms",
  "UniqueJewels",
  "UniqueSanctumRelics",
  "UniqueTablets",
] as const;

export type UniqueType = (typeof UNIQUE_TYPES)[number];

/**
 * Every stash type fetched: the uniques, then PrecursorTablets, whose 24 lines
 * are non-unique tablets split by rarity (name equals baseType, `variant`
 * Normal/Magic/Rare). The relay carries their prices but not their listing
 * counts, which the tablet confidence note needs.
 */
export const STASH_TYPES = [...UNIQUE_TYPES, "PrecursorTablets"] as const;

export type StashType = (typeof STASH_TYPES)[number];

const TABLET_TYPE: StashType = "PrecursorTablets";

/** Documented, at most hourly (D3). Add `?league=…&type=…`. */
export const UNIQUE_OVERVIEW_URL =
  "https://poe.ninja/poe2/api/economy/stash/current/item/overview";

export function uniqueOverviewUrl(league: string, type: StashType): string {
  const query = new URLSearchParams({ league, type });
  return `${UNIQUE_OVERVIEW_URL}?${query}`;
}

/**
 * "regular" rather than "base": a Runemastered item is itself a different base
 * type (research/uniques/_mechanics.md, 7.4).
 */
export type UniqueKind = "regular" | "Runemastered" | "Runeforged";

/** D7: low is 0-4 listings, medium 5-19, high 20 or more. */
export type Confidence = "high" | "medium" | "low";

/** At or above this many listings a line is high confidence (D7). */
export const HIGH_CONFIDENCE_LISTINGS = 20;
/** At or above this many listings a line is medium confidence; below, low. */
export const MEDIUM_CONFIDENCE_LISTINGS = 5;

export interface UniqueSparkLine {
  /** Percent change over the 7 days. */
  totalChange: number;
  data: Array<number | null>;
}

export interface UniqueLine {
  /** The overview the line came from; merging replaces per type. */
  type: StashType;
  name: string;
  baseType: string;
  /** A PrecursorTablets line's rarity: Normal, Magic or Rare. */
  variant?: string;
  kind: UniqueKind;
  /** poe.ninja's category with markup stripped, e.g. "Two Hand Mace". */
  category: string;
  /** In divines (the response's core.primary). */
  primaryValue: number;
  listingCount: number;
  /** poe.ninja spells it sparkLine here; the exchange overview says sparkline. */
  sparkLine: UniqueSparkLine | null;
  icon: string;
  detailsId: string;
  /** Explicit mod texts, markup stripped. Only with `{ mods: true }`. */
  mods?: string[];
}

export interface ParseOptions {
  /**
   * Keep explicit mod texts. Off by default: on 2026-11-02 all eight types
   * trimmed to 323 KB of JSON without mods and 500 KB with them, and nothing
   * at runtime reads them yet (the clipboard item's own ranges are what count).
   */
  mods?: boolean;
}

export interface UniqueVariant {
  line: UniqueLine;
  /** The line's own confidence, from its listing count. */
  confidence: Confidence;
  /**
   * The regular line a rune variant is compared against: the one whose
   * baseType is the variant's without its prefix, else the unique's only
   * regular line. Null for regular lines and when neither exists.
   */
  regular: UniqueLine | null;
  /**
   * primaryValue over the regular line's. Null for regular lines, without a
   * regular line, and when either side is low confidence (D7: low lines are
   * never used in multiples). Can be below 1.
   */
  multiple: number | null;
  /** The lower of the two sides' confidence; null without a regular line. */
  multipleConfidence: Confidence | null;
}

const RUNE_PREFIX = /^(Runemastered|Runeforged) (.+)$/;

/** "[EnergyShield|Energy Shield]" -> "Energy Shield"; "[Physical]" -> "Physical". */
export function stripMarkup(text: string): string {
  return text.replace(/\[([^\]|]*)(?:\|([^\]]*))?\]/g, (_, a, b) => b ?? a);
}

export function uniqueKind(baseType: string): UniqueKind {
  const prefix = RUNE_PREFIX.exec(baseType)?.[1];
  return prefix === "Runemastered" || prefix === "Runeforged"
    ? prefix
    : "regular";
}

/** "Runeforged Pointed Maul" -> "Pointed Maul"; other base types unchanged. */
export function regularBaseType(baseType: string): string {
  return RUNE_PREFIX.exec(baseType)?.[2] ?? baseType;
}

export function confidence(listingCount: number): Confidence {
  if (listingCount >= HIGH_CONFIDENCE_LISTINGS) return "high";
  if (listingCount >= MEDIUM_CONFIDENCE_LISTINGS) return "medium";
  return "low";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseSparkLine(value: unknown): UniqueSparkLine | null {
  if (
    !isObject(value) ||
    typeof value.totalChange !== "number" ||
    !Array.isArray(value.data)
  ) {
    return null;
  }
  return {
    totalChange: value.totalChange,
    data: value.data.map((x) => (typeof x === "number" ? x : null)),
  };
}

function parseLine(
  type: StashType,
  raw: unknown,
  options: ParseOptions,
): UniqueLine | null {
  if (!isObject(raw)) return null;
  const { name, baseType, primaryValue, listingCount } = raw;
  if (typeof name !== "string" || !name) return null;
  if (typeof baseType !== "string" || !baseType) return null;
  if (!isCount(primaryValue) || !isCount(listingCount)) return null;
  const line: UniqueLine = {
    type,
    name,
    baseType,
    kind: uniqueKind(baseType),
    category: typeof raw.category === "string" ? stripMarkup(raw.category) : "",
    primaryValue,
    listingCount,
    sparkLine: parseSparkLine(raw.sparkLine),
    icon: typeof raw.icon === "string" ? raw.icon : "",
    detailsId: typeof raw.detailsId === "string" ? raw.detailsId : "",
  };
  if (typeof raw.variant === "string" && raw.variant) {
    line.variant = raw.variant;
  }
  if (options.mods) {
    const mods = Array.isArray(raw.explicitModifiers)
      ? raw.explicitModifiers
      : [];
    line.mods = mods.flatMap((mod) =>
      isObject(mod) && typeof mod.text === "string"
        ? [stripMarkup(mod.text)]
        : [],
    );
  }
  return line;
}

/**
 * One type's overview, trimmed. Null when the response is unusable: not an
 * overview (a wrong type is a 404 with a problem body), no lines, or prices
 * not in divines. Malformed lines are skipped.
 */
export function parseUniqueOverview(
  type: StashType,
  body: unknown,
  options: ParseOptions = {},
): UniqueLine[] | null {
  if (!isObject(body) || !Array.isArray(body.lines)) return null;
  if (!isObject(body.core) || body.core.primary !== "divine") return null;
  const lines = body.lines.flatMap((raw) => {
    const line = parseLine(type, raw, options);
    return line ? [line] : [];
  });
  return lines.length ? lines : null;
}

/**
 * Replaces the lines of each type whose response parses to at least one line;
 * a type that failed, answered empty or was not fetched keeps its previous
 * lines. Pass a failed fetch as undefined or leave the type out.
 */
export function mergeUniqueLines(
  previous: readonly UniqueLine[],
  responses: Partial<Record<StashType, unknown>>,
  options: ParseOptions = {},
): UniqueLine[] {
  const fresh = new Map<StashType, UniqueLine[]>();
  for (const type of STASH_TYPES) {
    if (responses[type] === undefined) continue;
    const lines = parseUniqueOverview(type, responses[type], options);
    if (lines) fresh.set(type, lines);
  }
  return STASH_TYPES.flatMap(
    (type) => fresh.get(type) ?? previous.filter((line) => line.type === type),
  );
}

/** The line for one item: uniques are keyed by (name, baseType). */
export function uniqueLine(
  lines: readonly UniqueLine[],
  name: string,
  baseType: string,
): UniqueLine | undefined {
  return lines.find(
    (line) =>
      line.type !== TABLET_TYPE &&
      line.name === name &&
      line.baseType === baseType,
  );
}

/** A non-unique tablet's line, keyed by (name, rarity). */
export function tabletLine(
  lines: readonly UniqueLine[],
  name: string,
  variant: string,
): UniqueLine | undefined {
  return lines.find(
    (line) =>
      line.type === TABLET_TYPE &&
      line.name === name &&
      line.variant === variant,
  );
}

const KIND_ORDER: Record<UniqueKind, number> = {
  regular: 0,
  Runeforged: 1,
  Runemastered: 2,
};

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function lower(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[a] <= CONFIDENCE_ORDER[b] ? a : b;
}

/**
 * Every line of one unique, regular first, then Runeforged, then Runemastered
 * (the weapon upgrade order), each with its multiple against the regular
 * version and a confidence level (D7). Empty for an unknown name.
 */
export function uniqueVariants(
  lines: readonly UniqueLine[],
  name: string,
): UniqueVariant[] {
  const own = lines.filter(
    (line) => line.type !== TABLET_TYPE && line.name === name,
  );
  const regulars = own.filter((line) => line.kind === "regular");
  return own
    .map((line): UniqueVariant => {
      const level = confidence(line.listingCount);
      if (line.kind === "regular") {
        return {
          line,
          confidence: level,
          regular: null,
          multiple: null,
          multipleConfidence: null,
        };
      }
      const target = regularBaseType(line.baseType);
      const regular =
        regulars.find((r) => r.baseType === target) ??
        (regulars.length === 1 ? regulars[0] : null);
      if (!regular) {
        return {
          line,
          confidence: level,
          regular: null,
          multiple: null,
          multipleConfidence: null,
        };
      }
      const both = lower(level, confidence(regular.listingCount));
      return {
        line,
        confidence: level,
        regular,
        multiple:
          both === "low" || regular.primaryValue <= 0
            ? null
            : line.primaryValue / regular.primaryValue,
        multipleConfidence: both,
      };
    })
    .sort(
      (a, b) =>
        KIND_ORDER[a.line.kind] - KIND_ORDER[b.line.kind] ||
        a.line.baseType.localeCompare(b.line.baseType),
    );
}
