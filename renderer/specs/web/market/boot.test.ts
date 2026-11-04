import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import { formatAge } from "@/web/background/market/format.ts";
import {
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
} from "@/web/background/market/snapshot.ts";
import type { Snapshot } from "@/web/background/market/snapshot.ts";
import type { PriceCheckWidget } from "@/web/overlay/widgets";
import {
  cxHour,
  cxHourIds,
  fakeProxy,
  fixture,
  marketRoute,
} from "./prices-harness";

// WP-23: at start the app reads the league's snapshot through main's route,
// so the first price check has data even when every price source is down.

const offline = () =>
  fakeProxy({
    "": () => {
      throw new TypeError("Failed to fetch");
    },
  });
let proxy = offline();

vi.mock("@/web/background/IPC", () => ({
  Host: { proxy: (url: string, init?: RequestInit) => proxy(url, init) },
  MainProcess: { onEvent: vi.fn(), sendEvent: vi.fn() },
}));

const selectedId = ref("Forbidden Rites");
vi.mock("@/web/background/Leagues", () => ({
  useLeagues: () => ({
    selectedId,
    selected: computed(() => ({
      id: selectedId.value,
      isPopular: true,
      realm: "pc-ggg",
    })),
  }),
}));

const HOUR_MS = 3600_000;
const ETCHER = { ns: "ITEM", name: "Arcanist's Etcher" } as const;
const NEWEST = cxHourIds().at(-1)!;

function snapshot(league: string, ageMs: number): Snapshot {
  const hours = cxHourIds().map((hour) => ({
    hour,
    digest: JSON.parse(cxHour(hour)),
  }));
  const writtenAt = new Date(Date.now() - ageMs).toISOString();
  return {
    schemaVersion: SNAPSHOT_VERSION,
    league,
    writtenAt,
    cx: {
      asOfHour: NEWEST,
      hours: hours.map((h) => h.hour),
      pairs: aggregatePairs(hours, league),
    },
    relay: {
      fetchedAt: writtenAt,
      overview: JSON.parse(fixture("relay-overview-forbidden-rites.json")),
    },
  };
}

async function until(check: () => void, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      check();
      return;
    } catch (err) {
      if (Date.now() > end) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("boot from the snapshot", () => {
  const originalFetch = global.fetch;
  let route: ReturnType<typeof marketRoute>;

  beforeAll(async () => {
    setupTests();
    await init("en");
    // As in a saved config; unset, the first load sets it and reloads.
    const { AppConfig } = await import("@/web/Config");
    AppConfig<PriceCheckWidget>("price-check")!.coreCurrency = "exalted";
    route = marketRoute(global.fetch, {
      "forbidden-rites.json": serializeSnapshot(
        snapshot("Forbidden Rites", 2 * HOUR_MS),
      ),
      "runes-of-aldur.json": serializeSnapshot(
        snapshot("Runes of Aldur", 7 * HOUR_MS),
      ),
      // Another league's content under this name: not to be trusted.
      "standard.json": serializeSnapshot(
        snapshot("Forbidden Rites", 1 * HOUR_MS),
      ),
    });
    global.fetch = route.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("shows prices and their age with every price source offline", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const { useMarket } = await import("@/web/background/marketStore");
    const prices = usePoeninja();
    const market = useMarket();
    prices.queuePricesFetch();

    await until(() => {
      expect(market.asOfHour.value).toBe(NEWEST);
      expect(prices.findPriceByQuery(ETCHER)?.primaryValue).toBe(0.01816);
    });
    // The Currency Exchange headline, not poe.ninja's converted figure.
    const v = market.valueFor(ETCHER.ns, ETCHER.name, "exalted")!;
    expect(v.rule).toBe(1);
    expect(v.value).toBeCloseTo(4.908, 3);
    const shown = prices.cachedCurrencyByQuery(ETCHER, 1)!;
    expect(shown.currency).toBe("exalted");
    expect(shown.min).toBeCloseTo(4.908, 2);
    expect(prices.initialLoading()).toBe(false);
    // The relay's own age, for the panel's stale note.
    const age = Date.now() - prices.pricesFetchedAt.value!;
    expect(age).toBeGreaterThanOrEqual(2 * HOUR_MS);
    expect(age).toBeLessThan(2 * HOUR_MS + 60_000);
    // What PairRates prints next to the rates.
    expect(formatAge(market.asOfHour.value!, (NEWEST + 3 * 3600) * 1000)).toBe(
      "2 h ago",
    );

    // The read went through main's route; the failed refresh wrote nothing.
    expect(route.calls("GET").map(([url]) => url)).toEqual([
      "/market/forbidden-rites.json",
    ]);
    await settle();
    expect(route.calls("PUT")).toEqual([]);
    expect(route.calls("POST")).toEqual([]);
  });

  it("uses a snapshot over 6 hours old too, with its age", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const { useMarket } = await import("@/web/background/marketStore");
    selectedId.value = "Runes of Aldur";
    await until(() => {
      expect(route.calls("GET").map(([url]) => url)).toContain(
        "/market/runes-of-aldur.json",
      );
    });
    // The fixtures are Forbidden Rites hours, so no pair is this league's.
    await until(() => {
      expect(usePoeninja().findPriceByQuery(ETCHER)?.primaryValue).toBe(
        0.01816,
      );
    });
    expect(useMarket().asOfHour.value).toBe(NEWEST);
    // The panel dims a price this old and names its age (staleNote).
    const age = Date.now() - usePoeninja().pricesFetchedAt.value!;
    expect(age).toBeGreaterThanOrEqual(7 * HOUR_MS);
    expect(age).toBeLessThan(7 * HOUR_MS + 60_000);
  });

  it("ignores a snapshot whose league is not the selected one", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const { useMarket } = await import("@/web/background/marketStore");
    selectedId.value = "Standard";
    await until(() => {
      expect(route.calls("GET").map(([url]) => url)).toContain(
        "/market/standard.json",
      );
    });
    await settle();
    expect(useMarket().asOfHour.value).toBeUndefined();
    expect(usePoeninja().findPriceByQuery(ETCHER)).toBeNull();
  });

  it("still runs the normal refresh, which rewrites the snapshot", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    proxy = fakeProxy();
    const before = Date.now();
    selectedId.value = "Forbidden Rites";

    await until(() => {
      expect(route.calls("PUT")).toHaveLength(1);
    });
    const written = parseSnapshot(route.files["forbidden-rites.json"]);
    expect(written.league).toBe("Forbidden Rites");
    expect(Date.parse(written.writtenAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(written.relay!.fetchedAt)).toBeGreaterThanOrEqual(before);
    expect(written.cx?.asOfHour).toBe(NEWEST);
    expect(
      proxy.mock.calls.some(([url]) => url.endsWith("/overviewData.json")),
    ).toBe(true);
    expect(usePoeninja().findPriceByQuery(ETCHER)?.primaryValue).toBe(0.01816);
    // Fresh data is no longer stale.
    expect(usePoeninja().pricesFetchedAt.value).toBeGreaterThanOrEqual(before);
  });
});
