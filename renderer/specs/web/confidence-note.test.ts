import { describe, expect, it } from "vitest";
import {
  confidenceNote,
  staleNote,
  withStale,
} from "@/web/price-check/trends/confidenceNote.ts";

// WP-51: what the price panel says under a unique's price.
describe("confidenceNote", () => {
  it("dims and warns on a low-confidence price", () => {
    expect(confidenceNote(1)).toEqual({
      level: "low",
      dim: true,
      text: "1 listing on poe.ninja: an unreliable price",
    });
    expect(confidenceNote(4).dim).toBe(true);
  });

  it("names the listing count otherwise, without dimming", () => {
    expect(confidenceNote(5)).toEqual({
      level: "medium",
      dim: false,
      text: "5 listings on poe.ninja",
    });
    expect(confidenceNote(20)).toEqual({
      level: "high",
      dim: false,
      text: "20 listings on poe.ninja",
    });
  });

  it("reads poe.ninja's 10,000 cap as at least that many", () => {
    expect(confidenceNote(10000).text).toBe("10,000+ listings on poe.ninja");
    expect(confidenceNote(9999).text).toBe("9,999 listings on poe.ninja");
  });
});

// Saved prices are shown at once, however old; past STALE_HOURS the price is
// dimmed and its age named in the same line.
describe("staleNote", () => {
  const HOUR_MS = 3600_000;

  it("says nothing about prices under 6 hours old", () => {
    expect(staleNote("ninja", 5.9 * HOUR_MS)).toBeUndefined();
    expect(staleNote("ggg", 0)).toBeUndefined();
    expect(staleNote("ninja", undefined)).toBeUndefined();
  });

  it("dims an older price and names its source and age", () => {
    expect(staleNote("ninja", 9 * HOUR_MS + 5 * 60_000)).toEqual({
      level: "low",
      dim: true,
      text: "poe.ninja price from 9 h ago",
    });
    expect(staleNote("ggg", 3 * 24 * HOUR_MS)?.text).toBe(
      "Currency Exchange rate from 3 d ago",
    );
  });

  it("joins a listing count, dimming it", () => {
    const stale = staleNote("ninja", 7 * HOUR_MS);
    expect(withStale(confidenceNote(40), stale)).toEqual({
      level: "high",
      dim: true,
      text: "40 listings on poe.ninja; poe.ninja price from 7 h ago",
    });
    expect(withStale(confidenceNote(40), undefined)).toEqual(
      confidenceNote(40),
    );
    expect(withStale(undefined, stale)).toEqual(stale);
  });
});
