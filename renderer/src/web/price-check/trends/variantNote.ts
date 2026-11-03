// poe.ninja keeps one line per unique and base, so a unique whose versions
// differ by a chosen mod (Mageblood's Legacies, From Nothing's passive, Rite
// of Passage's Spirit, Morior Invictus's per-socket mods) gets one price for
// all of them. The search already filters on those mods; this note says the
// poe.ninja number does not. Pure: no Vue, no `@/`.

export interface VariantModInput {
  ref: string;
  /** The mod as shown on the item, values filled in. */
  text: string;
  /** A trade "option" stat: one of a fixed list of choices. */
  option: boolean;
  type: "explicit" | "implicit" | "other";
}

export interface VariantUnique {
  name: string;
  base: string;
  /** The mods every copy has; a mod outside them marks the version. */
  fixedStats?: readonly string[];
}

export interface VariantNote {
  headline: string;
  detail: string;
  mods: string[];
}

const NAMED = 4;

/**
 * The same rule that tags a search filter "variant" (create-stat-filters.ts):
 * an option stat, or a mod outside the unique's fixed mods, the implicits
 * only on a Runemastered base.
 */
function isVersionMod(unique: VariantUnique, mod: VariantModInput): boolean {
  if (mod.option) return true;
  if (!unique.fixedStats) return false;
  const counts =
    mod.type === "explicit" ||
    (mod.type === "implicit" && unique.base.startsWith("Runemastered"));
  if (!counts) return false;
  const ref = mod.ref.toLowerCase();
  return !unique.fixedStats.some((fixed) => fixed.toLowerCase() === ref);
}

export function variantNote(
  unique: VariantUnique,
  mods: readonly VariantModInput[],
): VariantNote | undefined {
  const named = mods
    .filter((mod) => isVersionMod(unique, mod))
    .map((mod) => mod.text.replace(/\s*\n\s*/g, " "));
  if (!named.length) return undefined;
  const shown = named.slice(0, NAMED).join(" · ");
  const more =
    named.length > NAMED ? `, and ${named.length - NAMED} more` : "";
  return {
    headline: `poe.ninja prices every version of ${unique.name} together`,
    detail: `This one: ${shown}${more}. Search prices it.`,
    mods: named,
  };
}
