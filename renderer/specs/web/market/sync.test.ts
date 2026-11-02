import { describe, expect, it, vi } from "vitest";
import {
  appendHistoryFile,
  historyLines,
  historyUrl,
  isUsableBootSnapshot,
  overviewText,
  readSnapshotFile,
  SNAPSHOT_MAX_HOURS,
  SYNC_INTERVAL_MS,
  snapshotUrl,
  writeSnapshotFile,
} from "@/web/background/market/sync.ts";
import type { FetchLike } from "@/web/background/market/sync.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import {
  serializeSnapshot,
  SNAPSHOT_VERSION,
} from "@/web/background/market/snapshot.ts";
import type { Snapshot } from "@/web/background/market/snapshot.ts";
import { cxHour, cxHourIds, fixture } from "./prices-harness";

// The app's side of the snapshot (guide/poe-source.html, D4, WP-23 to WP-25).

const NOW = Date.parse("2026-11-02T10:00:00Z");
const HOUR_MS = 3600_000;
const ETCHER_ID = "Metadata/Items/Currency/CurrencyMagicQuality";

function entries() {
  return cxHourIds().map((hour) => ({
    hour,
    digest: JSON.parse(cxHour(hour)),
  }));
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const hours = entries();
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
      overview: JSON.parse(fixture("relay-overview-forbidden-rites.json")),
    },
    ...overrides,
  };
}

function fakeFetch(status: number, body = "") {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
}

describe("constants", () => {
  it("refreshes hourly and boots from snapshots under 6 hours", () => {
    expect(SYNC_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(SNAPSHOT_MAX_HOURS).toBe(6);
  });
});

describe("routes", () => {
  it("names main's /market/ route by league slug", () => {
    expect(snapshotUrl("HC Forbidden Rites")).toBe(
      "/market/hc-forbidden-rites.json",
    );
    expect(historyUrl("Forbidden Rites")).toBe(
      "/market/forbidden-rites.history",
    );
  });
});

describe("isUsableBootSnapshot", () => {
  it("uses the selected league's snapshot under 6 hours old", () => {
    const s = snapshot();
    expect(isUsableBootSnapshot(s, "Forbidden Rites", NOW)).toBe(true);
    expect(
      isUsableBootSnapshot(s, "Forbidden Rites", NOW + 5.9 * HOUR_MS),
    ).toBe(true);
  });

  it("ignores one over 6 hours old", () => {
    expect(
      isUsableBootSnapshot(snapshot(), "Forbidden Rites", NOW + 6.1 * HOUR_MS),
    ).toBe(false);
  });

  it("ignores another league's", () => {
    expect(isUsableBootSnapshot(snapshot(), "HC Forbidden Rites", NOW)).toBe(
      false,
    );
  });

  it("ignores none at all", () => {
    expect(isUsableBootSnapshot(undefined, "Forbidden Rites", NOW)).toBe(false);
  });
});

describe("overviewText", () => {
  it("gives back the relay's text form, which the price parser searches", () => {
    const text = overviewText(snapshot().relay!.overview);
    expect(text).toBe(
      JSON.stringify(
        JSON.parse(fixture("relay-overview-forbidden-rites.json")),
      ),
    );
    // Prices.ts findPriceByQuery looks for this compact prefix.
    expect(text).toContain('{"name":"Arcanist\'s Etcher","primaryValue":');
  });
});

describe("readSnapshotFile", () => {
  it("reads the league's file through the route", async () => {
    const s = snapshot();
    const fetch = fakeFetch(200, serializeSnapshot(s));
    expect(await readSnapshotFile(fetch, "Forbidden Rites")).toEqual(s);
    expect(fetch).toHaveBeenCalledWith("/market/forbidden-rites.json", {
      cache: "no-store",
    });
  });

  it("has nothing when there is no file, a bad one, or no server", async () => {
    expect(
      await readSnapshotFile(fakeFetch(404), "Forbidden Rites"),
    ).toBeUndefined();
    // Vite's dev server answers unknown paths with index.html.
    expect(
      await readSnapshotFile(
        fakeFetch(200, "<!DOCTYPE html>"),
        "Forbidden Rites",
      ),
    ).toBeUndefined();
    const offline = vi.fn<FetchLike>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await readSnapshotFile(offline, "Forbidden Rites")).toBeUndefined();
  });
});

describe("writeSnapshotFile", () => {
  it("PUTs the serialized snapshot as JSON", async () => {
    const s = snapshot();
    const fetch = fakeFetch(204);
    await writeSnapshotFile(fetch, s);
    expect(fetch).toHaveBeenCalledWith("/market/forbidden-rites.json", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: serializeSnapshot(s),
    });
  });

  it("throws when main refuses", async () => {
    await expect(writeSnapshotFile(fakeFetch(413), snapshot())).rejects.toThrow(
      /413/,
    );
  });
});

describe("appendHistoryFile", () => {
  it("POSTs NDJSON lines", async () => {
    const fetch = fakeFetch(204);
    await appendHistoryFile(fetch, "Forbidden Rites", ['{"a":1}', '{"b":2}']);
    expect(fetch).toHaveBeenCalledWith("/market/forbidden-rites.history", {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: '{"a":1}\n{"b":2}\n',
    });
  });

  it("sends nothing for no lines", async () => {
    const fetch = fakeFetch(204);
    await appendHistoryFile(fetch, "Forbidden Rites", []);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when main refuses", async () => {
    await expect(
      appendHistoryFile(fakeFetch(400), "Forbidden Rites", ['{"a":1}']),
    ).rejects.toThrow(/400/);
  });
});

describe("historyLines", () => {
  it("writes one line per hour per pair of the league", () => {
    const hours = entries();
    const lines = historyLines(hours, "Forbidden Rites").map((line) =>
      JSON.parse(line),
    );

    let expected = 0;
    for (const entry of hours) {
      for (const pairs of Object.values(
        aggregatePairs([entry], "Forbidden Rites"),
      )) {
        expected += Object.keys(pairs).length;
      }
    }
    expect(lines).toHaveLength(expected);

    const etcher = lines.filter(
      (l) => l.id === ETCHER_ID && l.quote === "exalted",
    );
    expect(etcher.map((l) => l.hour)).toEqual(cxHourIds());
    const newest = etcher.at(-1);
    const own = aggregatePairs([hours.at(-1)!], "Forbidden Rites")[ETCHER_ID]
      .exalted!;
    expect(newest).toEqual({
      hour: hours.at(-1)!.hour,
      id: ETCHER_ID,
      quote: "exalted",
      typical: own.typical,
      low: own.low,
      high: own.high,
      traded: own.traded,
      quoteTraded: own.quoteTraded,
    });
  });

  it("leaves out other leagues and writes nothing for no hours", () => {
    const lines = historyLines(entries(), "Runes of Aldur").map((line) =>
      JSON.parse(line),
    );
    // The recorded Runes of Aldur markets are the Etcher's only.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.id === ETCHER_ID)).toBe(true);
    expect(historyLines([], "Forbidden Rites")).toEqual([]);
  });
});

describe("RELAY_NAMESPACE_MAP", () => {
  it("is the relay's namespaceMap.json as recorded, for starts without it", async () => {
    const { RELAY_NAMESPACE_MAP } = await import(
      "@/web/background/market/relayNamespaces.ts"
    );
    expect(RELAY_NAMESPACE_MAP).toEqual(
      JSON.parse(fixture("relay-namespace-map.json")),
    );
  });
});
