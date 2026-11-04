// WP-51 (fixes F9): a unique priced from a handful of listings is shown
// dimmed with its count, so a 1-listing line is not read as a real price.
import { confidence } from "../../background/market/uniques.ts";
import type { Confidence } from "../../background/market/uniques.ts";
import { STALE_HOURS } from "../../background/market/constants.ts";
import { formatAgeMs } from "../../background/market/format.ts";

export interface ConfidenceNote {
  level: Confidence;
  dim: boolean;
  text: string;
}

const NINJA_LISTING_CAP = 10000;

export function confidenceNote(listingCount: number): ConfidenceNote {
  const level = confidence(listingCount);
  // poe.ninja stops counting at 10,000.
  const number =
    listingCount >= NINJA_LISTING_CAP
      ? `${NINJA_LISTING_CAP.toLocaleString("en-US")}+`
      : listingCount.toLocaleString("en-US");
  const count = `${number} listing${listingCount === 1 ? "" : "s"} on poe.ninja`;
  return level === "low"
    ? { level, dim: true, text: `${count}: an unreliable price` }
    : { level, dim: false, text: count };
}

const STALE_MS = STALE_HOURS * 3600_000;
const SOURCE_TEXT = {
  ninja: "poe.ninja price",
  ggg: "Currency Exchange rate",
} as const;

/**
 * Saved prices are shown at once, however old (guide/poe-source.html, D4).
 * Past STALE_HOURS the price is dimmed, in the confidence line, with its age.
 */
export function staleNote(
  source: keyof typeof SOURCE_TEXT,
  ageMs: number | undefined,
): ConfidenceNote | undefined {
  if (ageMs === undefined || !(ageMs > STALE_MS)) return undefined;
  return {
    level: "low",
    dim: true,
    text: `${SOURCE_TEXT[source]} from ${formatAgeMs(ageMs)}`,
  };
}

/** One line for both: the listing count, then the age, dimmed. */
export function withStale(
  note: ConfidenceNote | undefined,
  stale: ConfidenceNote | undefined,
): ConfidenceNote | undefined {
  if (!stale) return note;
  if (!note) return stale;
  return { ...note, dim: true, text: `${note.text}; ${stale.text}` };
}
