import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import type { PriceCheckWidget } from "@/web/overlay/widgets";
import { cxHourIds, fakeProxy, marketRoute } from "./prices-harness";

let proxy = fakeProxy();

vi.mock("@/web/background/IPC", () => ({
  Host: { proxy: (url: string, init?: RequestInit) => proxy(url, init) },
  MainProcess: { onEvent: vi.fn(), sendEvent: vi.fn() },
}));

// Used by the hourly refresh tests at the end; the store does not read it.
vi.mock("@/web/background/Leagues", async () => {
  const { computed, ref } = await import("vue");
  const selectedId = ref("Forbidden Rites");
  return {
    useLeagues: () => ({
      selectedId,
      selected: computed(() => ({
        id: selectedId.value,
        isPopular: true,
        realm: "pc-ggg",
      })),
    }),
  };
});

// One minute into the hour after the newest recorded hour: that hour is not
// published yet (end of stream), so the window is exactly the six recordings.
const NEWEST = cxHourIds().at(-1)!;
const NOW_MS = (NEWEST + 2 * 3600 + 60) * 1000;

const ETCHER = { ns: "ITEM", name: "Arcanist's Etcher" } as const;

describe("useMarket", () => {
  beforeAll(() => {
    setupTests();
  });

  it("loads the feed and prices the Etcher from its own exalted pair", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    const { computed } = await import("vue");
    const market = useMarket();
    // Evaluated before anything is loaded, as a price check open at startup.
    const early = computed(() => market.pairsFor(ETCHER.ns, ETCHER.name));
    expect(early.value).toBeUndefined();
    await market.load("Forbidden Rites", NOW_MS);
    expect(early.value?.exalted?.typical).toBeCloseTo(4.908, 3);

    expect(market.asOfHour.value).toBe(NEWEST);
    const v = market.valueFor(ETCHER.ns, ETCHER.name, "exalted")!;
    expect(v.rule).toBe(1);
    expect(v.value).toBeCloseTo(4.908, 3);
    expect([v.low, v.high]).toEqual([3, 14]);
  });

  it("re-aggregates for another league without refetching", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    const market = useMarket();
    const callsBefore = proxy.mock.calls.length;
    await market.load("Runes of Aldur", NOW_MS);

    const v = market.valueFor(ETCHER.ns, ETCHER.name, "exalted")!;
    expect(v.value).toBeCloseTo(498 / 297, 3);
    // Only the unpublished hours are asked again; recorded hours stay cached.
    const hourCalls = proxy.mock.calls
      .slice(callsBefore)
      .filter(([url]) => /currency-exchange/.test(url));
    expect(hourCalls.every(([url]) => !url.endsWith(String(NEWEST)))).toBe(
      true,
    );
  });

  it("keeps the last prices when the feed fails", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    const market = useMarket();
    await market.load("Forbidden Rites", NOW_MS);
    proxy = fakeProxy({
      "web.poecdn.com": () => {
        throw new Error("offline");
      },
    });
    await market.load("Forbidden Rites", NOW_MS + 3 * 3600 * 1000);

    expect(market.valueFor(ETCHER.ns, ETCHER.name, "exalted")?.rule).toBe(1);
    expect(market.errors.value.length).toBeGreaterThan(0);
  });

  it("names the GGG id behind an item's pairs, for its history", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    const market = useMarket();
    await market.load("Forbidden Rites", NOW_MS);
    expect(market.pairIdFor(ETCHER.ns, ETCHER.name)).toBe(
      "Metadata/Items/Currency/CurrencyMagicQuality",
    );
    expect(market.pairIdFor("ITEM", "Not An Item")).toBeUndefined();
  });

  it("has nothing for an item the feed does not trade", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    expect(useMarket().valueFor("ITEM", "Not An Item", "exalted")).toBeNull();
  });
});

// WP-24: an hourly refresh while the price check is in use, each one written
// through main's /market/ route (guide/poe-source.html, D4).
describe("hourly refresh", () => {
  const MINUTE = 60_000;
  const originalFetch = global.fetch;
  let route: ReturnType<typeof marketRoute>;
  let prices: ReturnType<
    (typeof import("@/web/background/Prices"))["usePoeninja"]
  >;
  let market: ReturnType<
    (typeof import("@/web/background/marketStore"))["useMarket"]
  >;
  let elapsed = 0;

  const refreshes = () =>
    proxy.mock.calls.filter(([url]) => url.endsWith("/overviewData.json"))
      .length;
  const writes = () => route.calls("PUT").length;

  /** Lets in-flight loads finish: real timers, nothing new for 50 ms. */
  async function settle() {
    let seen = -1;
    while (seen !== proxy.mock.calls.length + route.fn.mock.calls.length) {
      seen = proxy.mock.calls.length + route.fn.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Moves the clock to `minutes` after the first refresh, tick by tick. */
  async function advanceTo(minutes: number) {
    while (elapsed < minutes) {
      const step = Math.min(4, minutes - elapsed);
      vi.advanceTimersByTime(step * MINUTE);
      elapsed += step;
      await settle();
    }
  }

  beforeAll(async () => {
    // A fresh store: the tests above already hold every recorded hour.
    vi.resetModules();
    const { init } = await import("@/assets/data");
    await init("en");
    // As in a saved config. Unset, the first load sets it, and the watcher
    // on it starts two more loads that this count is not about.
    const { AppConfig } = await import("@/web/Config");
    AppConfig<PriceCheckWidget>("price-check")!.coreCurrency = "exalted";
    proxy = fakeProxy();
    route = marketRoute(global.fetch);
    global.fetch = route.fetch;
    vi.useFakeTimers({
      now: NOW_MS,
      toFake: ["Date", "setInterval", "clearInterval"],
    });
    prices = (await import("@/web/background/Prices")).usePoeninja();
    market = (await import("@/web/background/marketStore")).useMarket();
  });

  afterAll(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("refreshes on interest and writes the snapshot and history", async () => {
    const { parseSnapshot } = await import(
      "@/web/background/market/snapshot.ts"
    );
    const { historyLines } = await import("@/web/background/market/sync.ts");
    const { cxHour } = await import("./prices-harness");

    prices.queuePricesFetch();
    await settle();

    expect(refreshes()).toBe(1);
    expect(route.calls("PUT").map(([url]) => url)).toEqual([
      "/market/forbidden-rites.json",
    ]);
    const written = parseSnapshot(route.files["forbidden-rites.json"]);
    expect(written.league).toBe("Forbidden Rites");
    expect(written.writtenAt).toBe(new Date(NOW_MS).toISOString());
    expect(written.cx?.hours).toEqual(cxHourIds());
    expect(written.relay?.overview).toBeTruthy();

    // The age label reads this hour: the newest one the feed published.
    expect(market.asOfHour.value).toBe(NEWEST);
    expect(written.cx?.asOfHour).toBe(NEWEST);

    // One line per hour per pair, for each newly fetched hour.
    const recorded = cxHourIds().map((hour) => ({
      hour,
      digest: JSON.parse(cxHour(hour)),
    }));
    expect(route.calls("POST").map(([url]) => url)).toEqual([
      "/market/forbidden-rites.history",
    ]);
    expect(
      route.files["forbidden-rites.history.ndjson"].trimEnd().split("\n"),
    ).toEqual(historyLines(recorded, "Forbidden Rites"));
  });

  it("does not refresh again inside 60 minutes, even with interest", async () => {
    await advanceTo(50);
    prices.queuePricesFetch();
    await settle();
    await advanceTo(59);
    expect(refreshes()).toBe(1);
    expect(writes()).toBe(1);
  });

  it("refreshes once after 60 minutes and writes again", async () => {
    await advanceTo(60);
    expect(refreshes()).toBe(2);
    expect(writes()).toBe(2);
    const { parseSnapshot } = await import(
      "@/web/background/market/snapshot.ts"
    );
    expect(parseSnapshot(route.files["forbidden-rites.json"]).writtenAt).toBe(
      new Date(NOW_MS + 60 * MINUTE).toISOString(),
    );
    // No new hour was published, so no history to add.
    expect(route.calls("POST")).toHaveLength(1);

    await advanceTo(68);
    expect(refreshes()).toBe(2);
  });

  it("does not refresh without interest", async () => {
    // Last interest was at minute 50; the window is 20 minutes.
    await advanceTo(60 + 180);
    expect(refreshes()).toBe(2);
    expect(writes()).toBe(2);
  });
});
