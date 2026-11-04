import { beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import {
  serializeSnapshot,
  SNAPSHOT_VERSION,
} from "@/web/background/market/snapshot.ts";
import type { PriceCheckWidget } from "@/web/overlay/widgets";
import {
  cxHour,
  cxHourIds,
  fakeProxy,
  fixture,
  marketRoute,
} from "./prices-harness";

// A saved price check set to chaos: reading the snapshot sets up the core
// currencies, which used to read as a currency change and wipe the prices
// it had just loaded, leaving nothing until the network answered.

const proxy = fakeProxy({
  "": () => {
    throw new TypeError("Failed to fetch");
  },
});

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

const ETCHER = { ns: "ITEM", name: "Arcanist's Etcher" } as const;

describe("boot with chaos as the core currency", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
    const { AppConfig } = await import("@/web/Config");
    AppConfig<PriceCheckWidget>("price-check")!.coreCurrency = "chaos";
    const hours = cxHourIds().map((hour) => ({
      hour,
      digest: JSON.parse(cxHour(hour)),
    }));
    const writtenAt = new Date(Date.now() - 3600_000).toISOString();
    const route = marketRoute(global.fetch, {
      "forbidden-rites.json": serializeSnapshot({
        schemaVersion: SNAPSHOT_VERSION,
        league: "Forbidden Rites",
        writtenAt,
        cx: {
          asOfHour: hours.at(-1)!.hour,
          hours: hours.map((h) => h.hour),
          pairs: aggregatePairs(hours, "Forbidden Rites"),
        },
        relay: {
          fetchedAt: writtenAt,
          overview: JSON.parse(fixture("relay-overview-forbidden-rites.json")),
        },
      }),
    });
    global.fetch = route.fetch;
  });

  it("keeps the saved prices while every source is offline", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const prices = usePoeninja();
    prices.queuePricesFetch();

    const end = Date.now() + 3000;
    while (!prices.findPriceByQuery(ETCHER) && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(prices.findPriceByQuery(ETCHER)?.primaryValue).toBe(0.01816);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(prices.findPriceByQuery(ETCHER)?.primaryValue).toBe(0.01816);
    expect(prices.xchgRate.value).toBeGreaterThan(0);
    expect(prices.initialLoading()).toBe(false);
  });
});
