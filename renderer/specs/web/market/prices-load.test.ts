import { beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { cxHourIds, fakeProxy } from "./prices-harness";

const proxy = fakeProxy();

vi.mock("@/web/background/IPC", () => ({
  Host: { proxy: (url: string, init?: RequestInit) => proxy(url, init) },
  MainProcess: { onEvent: vi.fn(), sendEvent: vi.fn() },
}));

vi.mock("@/web/background/Leagues", () => {
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

describe("usePoeninja load", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("revalidates the relay overview instead of reusing a 4-hour cache", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    usePoeninja().queuePricesFetch();

    await vi.waitFor(() => {
      const overview = proxy.mock.calls.find(([url]) =>
        url.endsWith("/overviewData.json"),
      );
      expect(overview).toBeDefined();
      expect(overview![1]?.cache).toBe("no-cache");
    });
  });

  it("still serves the relay's value for the Etcher", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    await vi.waitFor(() => {
      const entry = usePoeninja().findPriceByQuery({
        ns: "ITEM",
        name: "Arcanist's Etcher",
      });
      expect(entry?.primaryValue).toBe(0.01816);
    });
  });

  it("loads the Currency Exchange feed alongside the relay", async () => {
    await vi.waitFor(() => {
      expect(
        proxy.mock.calls.some(([url]) =>
          url.startsWith("web.poecdn.com/api/currency-exchange/poe2/"),
        ),
      ).toBe(true);
    });
  });

  it("prices exchange items from the Currency Exchange once it has loaded", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const { useMarket } = await import("@/web/background/marketStore");
    const prices = usePoeninja();
    const ETCHER = { ns: "ITEM", name: "Arcanist's Etcher" };

    const newest = cxHourIds().at(-1)!;
    const now = (newest + 2 * 3600 + 60) * 1000;
    await useMarket().load("Forbidden Rites", now);

    const after = prices.cachedCurrencyByQuery(ETCHER, 1)!;
    expect(after.currency).toBe("exalted");
    expect(after.min).toBeCloseTo(4.908, 2);
    expect(
      prices.divineValueByQuery(ETCHER)! * prices.xchgRate.value!,
    ).toBeCloseTo(4.908, 2);

    // A new table invalidates cached conversions.
    await useMarket().load("Runes of Aldur", now);
    expect(prices.cachedCurrencyByQuery(ETCHER, 1)!.min).toBeCloseTo(
      498 / 297,
      2,
    );
    await useMarket().load("Forbidden Rites", now);
  });
});
