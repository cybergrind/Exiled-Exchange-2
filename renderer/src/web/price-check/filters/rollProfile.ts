// WP-65: which mods of a unique matter (research/uniques profiles, D7) and how
// good this copy's roll is. No price: the market search is the user's call.
// Pure: no Vue, no `@/`.
import type {
  RollEntry,
  RollProfileFile,
  RollThresholds,
} from "../../background/market/rollProfileSchema.ts";

export type RollGrade = "perfect" | "top" | "good";

export const ROLL_GRADE_LABEL: Record<RollGrade, string> = {
  perfect: "Perfect roll",
  top: "Top roll",
  good: "Good roll",
};

/** Without researched breakpoints, the top fifth of the range is a top roll. */
export const TOP_ROLL = 0.8;

export function profileRoll(
  file: RollProfileFile | undefined,
  unique: string,
  statRef: string,
): RollEntry | undefined {
  return file?.uniques[unique]?.rolls.find((roll) => roll.statRef === statRef);
}

/**
 * How good a roll is. `goodness` is the filter's 0..1 position in the range,
 * already turned round where lower is better; breakpoints are in the stat's
 * own units, `great` at the better end.
 */
export function rollGrade(roll: {
  goodness: number | undefined;
  value: number;
  thresholds?: RollThresholds;
}): RollGrade | undefined {
  if (roll.goodness === undefined) return undefined;
  if (roll.goodness >= 1) return "perfect";
  const t = roll.thresholds;
  if (!t) return roll.goodness >= TOP_ROLL ? "top" : undefined;
  const higherIsBetter = t.great >= t.good;
  // `value` is the number shown on the item: the filter already turns a
  // "fewer"/"reduced" roll round (filterAdjustmentForNegate), and a real
  // negative such as Temporalis's "-2 seconds to Cooldown" stays negative.
  const reaches = (mark: number) =>
    higherIsBetter ? roll.value >= mark : roll.value <= mark;
  if (reaches(t.great)) return "top";
  if (reaches(t.good)) return "good";
  return undefined;
}

export interface UniqueRollBadgeData {
  importance?: "key" | "good";
  why?: string;
  grade?: RollGrade;
}

/**
 * What a unique mod's badge shows. A profiled unique grades only its key and
 * valued mods: filler is not worth a highlight, and some filler is a drawback
 * whose "better" direction is the enemy's. An unprofiled unique grades every
 * ranged mod. `roll` is undefined for a mod without a range.
 */
export function uniqueRollBadge(
  file: RollProfileFile | undefined,
  unique: string,
  statRef: string,
  roll: { goodness: number | undefined; value: number } | undefined,
): UniqueRollBadgeData {
  const profiled = file?.uniques[unique] !== undefined;
  const entry = profileRoll(file, unique, statRef);
  const valued =
    entry && entry.importance !== "filler" ? entry.importance : undefined;
  if (profiled && !valued) return {};
  const grade = roll
    ? rollGrade({ ...roll, thresholds: entry?.thresholds })
    : undefined;
  return {
    ...(valued ? { importance: valued, why: entry!.why } : {}),
    ...(grade ? { grade } : {}),
  };
}
