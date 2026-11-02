import { beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { setupTests } from "@specs/vitest.setup";
import { init, ITEM_DROP as BUNDLED_DROP } from "@/assets/data";
import { fakeProxy } from "./prices-harness";

const proxy = fakeProxy({
  "api.exiledexchange2.dev/proxy/data/item-drop.json": () => {
    throw new Error("relay down");
  },
});

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

describe("usePoeninja without the relay's drop list", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
  });

  it("uses the bundled drop list and still loads prices", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const prices = usePoeninja();
    prices.queuePricesFetch();

    await vi.waitFor(() => {
      expect(
        prices.findPriceByQuery({ ns: "ITEM", name: "Arcanist's Etcher" }),
      ).not.toBeNull();
    });
    expect(BUNDLED_DROP.length).toBeGreaterThan(0);
    expect(prices.ITEM_DROP.value).toEqual(BUNDLED_DROP);
  });
});
