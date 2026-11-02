// WP-51 (fixes F9): a unique priced from a handful of listings is shown
// dimmed with its count, so a 1-listing line is not read as a real price.
import { confidence } from "../../background/market/uniques.ts";
import type { Confidence } from "../../background/market/uniques.ts";

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
