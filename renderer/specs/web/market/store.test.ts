import { beforeAll, describe, expect, it, vi } from "vitest";
import { setupTests } from "@specs/vitest.setup";
import { cxHourIds, fakeProxy } from "./prices-harness";

let proxy = fakeProxy();

vi.mock("@/web/background/IPC", () => ({
  Host: { proxy: (url: string, init?: RequestInit) => proxy(url, init) },
  MainProcess: { onEvent: vi.fn(), sendEvent: vi.fn() },
}));

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

  it("has nothing for an item the feed does not trade", async () => {
    const { useMarket } = await import("@/web/background/marketStore");
    expect(useMarket().valueFor("ITEM", "Not An Item", "exalted")).toBeNull();
  });
});
