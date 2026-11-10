import { describe, expect, it } from "vitest";
import {
  floorGap,
  floorGapText,
  listingFloor,
  noNinjaText,
} from "@/web/price-check/trade/listingFloor";

describe("listingFloor", () => {
  it("is the median of the five cheapest priced listings", () => {
    expect(listingFloor([0.01, 0.2, 0.21, 0.21, 0.21, 5])).toBe(0.21);
  });

  it("skips unpriced listings and needs three", () => {
    expect(listingFloor([undefined, 0.2, undefined, 0.3])).toBeUndefined();
    expect(listingFloor([undefined, 0.2, 0.3, 0.4])).toBe(0.3);
  });
});

describe("floorGap", () => {
  // The Fall of the Axe: poe.ninja 0.5215 div, Instant buyouts at 150 ex.
  const axe = Array(20).fill(150 / 710);

  it("flags listings far under poe.ninja", () => {
    const gap = floorGap(axe, 0.5215)!;
    expect(gap.direction).toBe("below");
    expect(floorGapText(gap, "150 ex", "370 ex")).toBe(
      "Listings start at 150 ex, 59% under poe.ninja's 370 ex. poe.ninja's price is likely too high; price from the listings.",
    );
  });

  it("flags listings far over poe.ninja", () => {
    // Ritual Tablet: poe.ninja 0.42 div, Instant listings at 1 div.
    const gap = floorGap(Array(20).fill(1), 0.4209)!;
    expect(gap.direction).toBe("above");
    expect(floorGapText(gap, "1 div", "301 ex")).toContain("2.4×");
  });

  it("stays quiet when they roughly agree", () => {
    // Temple Tablet: poe.ninja 0.86 div, listings at 1 div.
    expect(floorGap(Array(20).fill(1), 0.86)).toBeUndefined();
    expect(floorGap(axe, undefined)).toBeUndefined();
  });
});

describe("noNinjaText", () => {
  it("prices from the listings when poe.ninja has no line", () => {
    // Murkshaft: no poe.ninja line, 576 listings from 2 ex.
    const floor = listingFloor([2, 2, 3, 3, 3].map((ex) => ex / 622));
    expect(floor! * 622).toBeCloseTo(3, 6);
    expect(noNinjaText("3 ex")).toBe(
      "poe.ninja has no price for this item. Listings start at 3 ex (the middle of the 5 cheapest).",
    );
  });
});
