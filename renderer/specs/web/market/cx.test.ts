import { describe, expect, it } from "vitest";
import { aggregatePairs, type CxHourEntry } from "@/web/background/market/cx";
import type { CxHour, CxMarket } from "@/web/background/market/types";
import { cxHour, cxHourIds } from "./prices-harness";

// Golden values: guide/poe-source.html WP-11, over the six recorded hours.
const FR = "Forbidden Rites";
const ETCHER = "Metadata/Items/Currency/CurrencyMagicQuality";
const GEMCUTTER = "Metadata/Items/Currency/CurrencyGemQuality";
const EXALTED = "Metadata/Items/Currency/CurrencyAddModToRare";
const DIVINE = "Metadata/Items/Currency/CurrencyModValues";

function recordedHours(): CxHourEntry[] {
  return cxHourIds().map((hour) => ({
    hour,
    digest: JSON.parse(cxHour(hour)) as CxHour,
  }));
}

function mapMarkets(
  hours: CxHourEntry[],
  fn: (m: CxMarket) => CxMarket,
): CxHourEntry[] {
  return hours.map(({ hour, digest }) => ({
    hour,
    digest: { ...digest, markets: digest.markets.map(fn) },
  }));
}

describe("aggregatePairs over the six recorded hours", () => {
  const table = aggregatePairs(recordedHours(), FR);

  it("prices Arcanist's Etcher in exalted", () => {
    const ex = table[ETCHER]?.exalted;
    expect(ex).toBeDefined();
    expect(ex!.typical).toBeCloseTo(4.908, 3);
    expect(ex!.low).toBe(3);
    expect(ex!.high).toBe(14);
    expect(ex!.traded).toBe(2456);
    expect(ex!.quoteTraded).toBe(12054);
    expect(ex!.hours).toBe(6);
  });

  it("prices Arcanist's Etcher in chaos", () => {
    const chaos = table[ETCHER]?.chaos;
    expect(chaos).toBeDefined();
    expect(chaos!.typical).toBeCloseTo(0.1561, 4);
    expect(chaos!.low).toBeCloseTo(0.05, 10);
    expect(chaos!.high).toBeCloseTo(0.25, 10);
    expect(chaos!.traded).toBe(3864);
  });

  it("prices Arcanist's Etcher in divine", () => {
    const div = table[ETCHER]?.divine;
    expect(div).toBeDefined();
    expect(div!.typical).toBeCloseTo(0.01894, 5);
    expect(div!.low).toBeCloseTo(0.01205, 5);
    expect(div!.high).toBeCloseTo(0.02326, 5);
    expect(div!.traded).toBe(4118);
  });

  it("prices Gemcutter's Prism in exalted", () => {
    expect(table[GEMCUTTER]?.exalted?.typical).toBeCloseTo(17.11, 2);
  });

  it("takes low and high across both ratio fields", () => {
    // For the Etcher's exalted pair lowest_ratio alone spans 5–14 ex and
    // highest_ratio alone 3–3.6 ex. Reading one field per bound gives 5 / 3.6.
    const ex = table[ETCHER]!.exalted!;
    expect(ex.low).toBe(3);
    expect(ex.high).toBe(14);
    expect(ex.low).toBeLessThanOrEqual(ex.typical);
    expect(ex.high).toBeGreaterThanOrEqual(ex.typical);
  });

  it("prices both directions of a quote-quote market", () => {
    const divInEx = table[DIVINE]?.exalted;
    expect(divInEx?.typical).toBeCloseTo(681.2, 1);
    expect(divInEx?.low).toBe(580);
    expect(divInEx?.high).toBe(718);
    const exInDiv = table[EXALTED]?.divine;
    expect(exInDiv).toBeDefined();
    expect(exInDiv!.typical).toBeCloseTo(1 / divInEx!.typical, 8);
    expect(exInDiv!.traded).toBe(divInEx!.quoteTraded);
    expect(exInDiv!.quoteTraded).toBe(divInEx!.traded);
  });

  it("never prices a quote currency in itself", () => {
    expect(table[EXALTED]?.exalted).toBeUndefined();
    expect(table[DIVINE]?.divine).toBeUndefined();
  });

  it("reports the newest hour as asOfHour", () => {
    const newest = Math.max(...cxHourIds());
    expect(table[ETCHER]!.exalted!.asOfHour).toBe(newest);
    expect(table[DIVINE]!.exalted!.asOfHour).toBe(newest);
  });

  it("reports asOfHour independent of input order", () => {
    const reversed = aggregatePairs(recordedHours().reverse(), FR);
    expect(reversed[ETCHER]?.exalted?.asOfHour).toBe(Math.max(...cxHourIds()));
    expect(reversed).toEqual(table);
  });

  it("does not apply a thinness cut", () => {
    const rof = aggregatePairs(recordedHours(), "Runes of Aldur");
    expect(rof[ETCHER]?.divine?.traded).toBe(440);
    const firstHour = aggregatePairs(recordedHours().slice(0, 1), FR);
    expect(firstHour[ETCHER]?.exalted?.hours).toBe(1);
  });
});

describe("aggregatePairs league filter", () => {
  it("ignores markets from other leagues", () => {
    const hours = recordedHours();
    const onlyFr = hours.map(({ hour, digest }) => ({
      hour,
      digest: {
        ...digest,
        markets: digest.markets.filter((m) => m.league === FR),
      },
    }));
    const table = aggregatePairs(hours, FR);
    expect(table[ETCHER]?.exalted?.traded).toBe(2456);
    expect(table).toEqual(aggregatePairs(onlyFr, FR));
  });

  it("aggregates another league on its own figures", () => {
    const rof = aggregatePairs(recordedHours(), "Runes of Aldur");
    const ex = rof[ETCHER]?.exalted;
    expect(ex).toBeDefined();
    expect(ex!.typical).toBeCloseTo(498 / 297, 6);
    expect(ex!.traded).toBe(297);
    expect(ex!.low).toBe(0.5);
    expect(ex!.high).toBe(9);
    expect(ex!.hours).toBe(4);
    // Only Etcher markets were recorded for Runes of Aldur.
    expect(Object.keys(rof)).toEqual([ETCHER]);
  });

  it("returns nothing for an unknown league", () => {
    expect(aggregatePairs(recordedHours(), "Standard")).toEqual({});
  });
});

describe("aggregatePairs input handling", () => {
  it("gives identical results when market_pair order is swapped", () => {
    const hours = recordedHours();
    const swapped = mapMarkets(hours, (m) => ({
      ...m,
      market_pair: [m.market_pair[1], m.market_pair[0]],
    }));
    const table = aggregatePairs(swapped, FR);
    expect(table[ETCHER]?.exalted?.typical).toBeCloseTo(4.908, 3);
    expect(table[DIVINE]?.exalted?.low).toBe(580);
    expect(table).toEqual(aggregatePairs(hours, FR));
  });

  it("ignores a market with zero volume on one side", () => {
    const hours = recordedHours();
    const base = aggregatePairs(hours, FR);
    const zeroed = mapMarkets(hours, (m) =>
      m.league === FR &&
      m.market_pair.includes(GEMCUTTER) &&
      m.market_pair.includes(EXALTED)
        ? { ...m, volume_traded: { ...m.volume_traded, [EXALTED]: 0 } }
        : m,
    );
    const table = aggregatePairs(zeroed, FR);
    expect(base[GEMCUTTER]?.exalted).toBeDefined();
    expect(table[GEMCUTTER]?.exalted).toBeUndefined();
    expect(table[GEMCUTTER]?.chaos).toBeDefined();
    expect(table[GEMCUTTER]?.chaos).toEqual(base[GEMCUTTER]?.chaos);
    for (const item of Object.values(table)) {
      for (const stat of Object.values(item)) {
        expect(Number.isFinite(stat!.typical)).toBe(true);
        expect(Number.isFinite(stat!.low)).toBe(true);
        expect(Number.isFinite(stat!.high)).toBe(true);
      }
    }
  });

  it("skips the recorded all-zero markets without dividing", () => {
    // Runes of Aldur records Etcher|chaos and Etcher|divine hours with no trades.
    const rof = aggregatePairs(recordedHours(), "Runes of Aldur");
    expect(rof[ETCHER]?.chaos).toBeUndefined();
    expect(rof[ETCHER]?.divine?.hours).toBe(1);
    expect(Number.isFinite(rof[ETCHER]!.divine!.low)).toBe(true);
  });

  it("returns an empty table for no hours", () => {
    expect(aggregatePairs([], FR)).toEqual({});
  });
});
