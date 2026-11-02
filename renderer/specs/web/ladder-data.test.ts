import { beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";
import { cxHourIds, fakeProxy } from "./market/prices-harness";

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

const ETCHER = { ns: "ITEM", name: "Arcanist's Etcher" };
const BARTERING = { ns: "ITEM", name: "Omen of Bartering" };

describe("ladder data", () => {
  beforeAll(async () => {
    setupTests();
    await init("en");
    const { usePoeninja } = await import("@/web/background/Prices");
    const { useMarket } = await import("@/web/background/marketStore");
    usePoeninja().queuePricesFetch();
    await vi.waitFor(() => {
      expect(usePoeninja().findPriceByQuery(ETCHER)).not.toBeNull();
    });
    const newest = cxHourIds().at(-1)!;
    await useMarket().load("Forbidden Rites", (newest + 2 * 3600 + 60) * 1000);
  });

  it("finds the poe.ninja category an exchange item belongs to", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    const currency = usePoeninja().categoryLines(ETCHER)!;
    expect(currency.type).toBe("Currency");
    expect(currency.lines.map((l) => l.name)).toContain("Orb of Alchemy");
    const etcher = currency.lines.find((l) => l.name === ETCHER.name)!;
    expect(etcher.primaryValue).toBe(0.01816);
    expect(etcher.totalChange).toBe(-0.29);

    const omens = usePoeninja().categoryLines(BARTERING)!;
    expect(omens.type).toBe("Ritual");
    expect(omens.lines).toHaveLength(38);
  });

  it("has no category for an item poe.ninja does not list", async () => {
    const { usePoeninja } = await import("@/web/background/Prices");
    expect(
      usePoeninja().categoryLines({ ns: "ITEM", name: "Not An Item" }),
    ).toBeUndefined();
  });

  it("builds the item's ladder with exchange pairs and icons", async () => {
    const { ladderFor } = await import("@/web/price-check/ladder/useLadder");
    const result = ladderFor(BARTERING)!;
    expect(result.category).toBe("Omens");
    expect(result.ladder.total).toBe(38);
    const row = result.ladder.rows.find((r) => r.checked)!;
    expect(row.name).toBe(BARTERING.name);
    // Its own exalted pair, not poe.ninja's divine-converted value.
    expect(row.value!.source).toBe("ggg");
    expect(row.value!.currency).toBe("exalted");
    expect(row.icon).toMatch(/^https?:|\.png|\.webp/);
  });

  it("ranks a tablet among every tablet base, rarity and unique", async () => {
    const { ladderFor } = await import("@/web/price-check/ladder/useLadder");
    const result = ladderFor({
      ns: "ITEM",
      name: "Ritual Tablet",
      variant: "Magic",
    })!;
    expect(result.category).toBe("Tablets");
    expect(result.ladder.total).toBe(24 + 9);
    const row = result.ladder.rows.find((r) => r.checked)!;
    expect(row.label).toBe("Ritual · Magic");
    expect(row.value!.source).toBe("ninja");
    expect(row.change).toBe(54.44);
    expect(row.icon).toBeTruthy();

    const unique = ladderFor({
      ns: "UNIQUE",
      name: "Freedom of Faith",
      variant: "Ritual Tablet",
    })!;
    expect(unique.category).toBe("Tablets");
    expect(unique.ladder.rows.find((r) => r.checked)!.label).toBe(
      "Freedom of Faith",
    );
  });

  it("has no ladder for items outside the exchange categories", async () => {
    const { ladderFor } = await import("@/web/price-check/ladder/useLadder");
    expect(ladderFor({ ns: "UNIQUE", name: "Temporalis" })).toBeNull();
    expect(ladderFor({ ns: "ITEM", name: "Not An Item" })).toBeNull();
  });

  it("finds the category of an item poe.ninja skips through its tiers", async () => {
    // As "Essence of the Infinite" is found through "Greater Essence of the
    // Infinite"; the recorded omens give the same shape.
    const { usePoeninja } = await import("@/web/background/Prices");
    const missing = { ns: "ITEM", name: "Dextral Annulment" };
    expect(usePoeninja().categoryLines(missing)).toBeUndefined();
    expect(usePoeninja().categoryLines(missing, { family: true })!.type).toBe(
      "Ritual",
    );
  });

  it("shows such an item in its category's ladder without a price", async () => {
    const { ladderFor } = await import("@/web/price-check/ladder/useLadder");
    const result = ladderFor({ ns: "ITEM", name: "Dextral Annulment" })!;
    expect(result.category).toBe("Omens");
    expect(result.ladder.total).toBe(39);
    const row = result.ladder.rows.find((r) => r.checked)!;
    expect(row.noValue).toBe(true);
  });
});
