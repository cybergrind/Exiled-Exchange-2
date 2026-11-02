import { describe, expect, it } from "vitest";
import { confidenceNote } from "@/web/price-check/trends/confidenceNote.ts";

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
