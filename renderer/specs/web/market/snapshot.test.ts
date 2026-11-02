import { describe, expect, it } from "vitest";
import {
  isSnapshotStale,
  isValidSlug,
  leagueSlug,
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
} from "@/web/background/market/snapshot.ts";
import type { Snapshot } from "@/web/background/market/snapshot.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import { cxHour, cxHourIds, fixture } from "./prices-harness";

const NOW = Date.parse("2026-11-02T10:00:00Z");

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const hours = cxHourIds().map((hour) => ({
    hour,
    digest: JSON.parse(cxHour(hour)),
  }));
  return {
    schemaVersion: SNAPSHOT_VERSION,
    league: "Forbidden Rites",
    writtenAt: new Date(NOW).toISOString(),
    cx: {
      asOfHour: hours.at(-1)!.hour,
      hours: hours.map((h) => h.hour),
      pairs: aggregatePairs(hours, "Forbidden Rites"),
    },
    relay: {
      fetchedAt: new Date(NOW).toISOString(),
      etag: '"d7f0a6f1"',
      overview: JSON.parse(fixture("relay-overview-forbidden-rites.json")),
    },
    ...overrides,
  };
}

describe("leagueSlug", () => {
  it.each([
    ["Forbidden Rites", "forbidden-rites"],
    ["HC Forbidden Rites", "hc-forbidden-rites"],
    ["Runes of Aldur", "runes-of-aldur"],
    ["HC Runes of Aldur", "hc-runes-of-aldur"],
    ["Standard", "standard"],
    ["Hardcore", "hardcore"],
  ])("%s -> %s", (league, slug) => {
    expect(leagueSlug(league)).toBe(slug);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("cannot produce a path", () => {
    expect(leagueSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(isValidSlug("../x")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(() => leagueSlug("///")).toThrow();
  });
});

describe("snapshot file", () => {
  it("round-trips the D4 schema", () => {
    const original = snapshot();
    const parsed = parseSnapshot(serializeSnapshot(original));
    expect(parsed).toEqual(original);
    // The Etcher's exalted pair survives intact.
    const etcher = Object.entries(parsed.cx!.pairs).find(([id]) =>
      id.endsWith("CurrencyMagicQuality"),
    )![1];
    expect(etcher.exalted!.typical).toBeCloseTo(4.908, 3);
  });

  it("keeps the relay overview usable by the app's text lookup", () => {
    // findPriceByQuery searches the compact JSON text for this exact prefix,
    // so key order and the absence of whitespace must survive the round trip.
    const text = JSON.stringify(
      parseSnapshot(serializeSnapshot(snapshot())).relay!.overview,
    );
    expect(text).toContain(
      '{"name":"Arcanist\'s Etcher","primaryValue":0.01816,',
    );
    expect(text).not.toMatch(/":\s|,\s"/);
  });

  it("rejects an unknown schema version", () => {
    const text = serializeSnapshot(snapshot()).replace(
      '"schemaVersion":1',
      '"schemaVersion":2',
    );
    expect(() => parseSnapshot(text)).toThrow(/schema/);
  });

  it("rejects files that are not snapshots", () => {
    expect(() => parseSnapshot("")).toThrow();
    expect(() => parseSnapshot("{}")).toThrow();
    expect(() => parseSnapshot('{"schemaVersion":1}')).toThrow(/league/);
  });
});

describe("isSnapshotStale", () => {
  const at = (minutesAgo: number) =>
    snapshot({ writtenAt: new Date(NOW - minutesAgo * 60_000).toISOString() });

  it("is fresh at 59 minutes and stale at 61, for a 60-minute limit", () => {
    expect(isSnapshotStale(at(59), 60, NOW)).toBe(false);
    expect(isSnapshotStale(at(61), 60, NOW)).toBe(true);
  });

  it("is stale when there is no file", () => {
    expect(isSnapshotStale(undefined, 60, NOW)).toBe(true);
  });

  it("is stale for another league", () => {
    expect(isSnapshotStale(at(1), 60, NOW, "Runes of Aldur")).toBe(true);
    expect(isSnapshotStale(at(1), 60, NOW, "Forbidden Rites")).toBe(false);
  });
});
