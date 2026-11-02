import { afterEach, describe, expect, it, vi } from "vitest";
import { STASH_TYPES } from "@/web/background/market/uniques.ts";
import { fixture } from "./prices-harness";

// WP-50 app side: the unique lines behind the price panel and variant panel.
const proxy = vi.fn(async (url: string) => {
  const type = new URL(`https://${url}`).searchParams.get("type");
  const file = {
    UniqueWeapons: "stash-unique-weapons.json",
    UniqueArmours: "stash-unique-armours.json",
    PrecursorTablets: "stash-precursor-tablets.json",
  }[type ?? ""];
  return file
    ? new Response(fixture(file), { status: 200 })
    : new Response(fixture("stash-wrong-type.json"), { status: 404 });
});

vi.mock("@/web/background/IPC", () => ({
  Host: { proxy: (url: string) => proxy(url) },
}));

const NOW = Date.parse("2026-11-02T15:00:00Z");
const HOUR = 3600_000;

async function fresh() {
  vi.resetModules();
  proxy.mockClear();
  const { useUniqueLines } = await import("@/web/background/uniquesStore.ts");
  return useUniqueLines();
}

afterEach(() => vi.clearAllMocks());

describe("useUniqueLines", () => {
  it("fetches every unique type through the proxy", async () => {
    const store = await fresh();
    expect(await store.refresh("Forbidden Rites", NOW)).toBe(true);
    expect(proxy).toHaveBeenCalledTimes(STASH_TYPES.length);
    expect(proxy.mock.calls[0][0]).toMatch(
      /^poe\.ninja\/poe2\/api\/economy\/stash\/current\/item\/overview\?league=Forbidden\+Rites&type=Unique/,
    );
    expect(
      store.lineFor("Svalinn", "Crucible Tower Shield")?.listingCount,
    ).toBe(859);
  });

  it("fetches again only after an hour, or for another league", async () => {
    const store = await fresh();
    await store.refresh("Forbidden Rites", NOW);
    expect(await store.refresh("Forbidden Rites", NOW + HOUR / 2)).toBe(false);
    expect(proxy).toHaveBeenCalledTimes(STASH_TYPES.length);
    await store.refresh("Forbidden Rites", NOW + HOUR + 1);
    expect(proxy).toHaveBeenCalledTimes(2 * STASH_TYPES.length);
    await store.refresh("Standard", NOW + HOUR + 2);
    expect(proxy).toHaveBeenCalledTimes(3 * STASH_TYPES.length);
    expect(store.league.value).toBe("Standard");
  });

  it("starts from the snapshot's block and hands it back for the next write", async () => {
    const store = await fresh();
    await store.refresh("Forbidden Rites", NOW);
    const block = store.snapshotBlock("Forbidden Rites")!;
    expect(block.fetchedAt).toBe(new Date(NOW).toISOString());

    const next = await fresh();
    next.restore("Forbidden Rites", block);
    expect(next.lineFor("Tidebreaker", "Runeforged Pointed Maul")).toBeTruthy();
    expect(next.snapshotBlock("Standard")).toBeUndefined();
    // The restored lines are recent, so no fetch.
    expect(await next.refresh("Forbidden Rites", NOW + 60_000)).toBe(false);
    expect(proxy).not.toHaveBeenCalled();
  });

  it("groups a unique's variants with multiples", async () => {
    const store = await fresh();
    await store.refresh("Forbidden Rites", NOW);
    const variants = store.variantsFor("Svalinn");
    expect(variants.map((v) => v.line.kind)).toEqual([
      "regular",
      "Runemastered",
    ]);
    expect(variants[1].multiple).toBeLessThan(1);
  });

  it("tells the confidence of a unique's price, low under five listings", async () => {
    const store = await fresh();
    await store.refresh("Forbidden Rites", NOW);
    expect(store.confidenceFor("Svalinn", "Crucible Tower Shield")).toBe(
      "high",
    );
    const winters = store.lines.value.find((l) => l.name === "Winter's Bite")!;
    expect(store.confidenceFor(winters.name, winters.baseType)).toBe("low");
    expect(store.confidenceFor("Not A Unique", "Ring")).toBeUndefined();
  });

  it("finds a tablet's line by base and rarity", async () => {
    const store = await fresh();
    await store.refresh("Forbidden Rites", NOW);
    expect(store.tabletLineFor("Ritual Tablet", "Magic")?.listingCount).toBe(
      10000,
    );
    expect(store.tabletLineFor("Overseer Tablet", "Normal")?.listingCount).toBe(
      3,
    );
    expect(store.tabletLineFor("Ritual Tablet", undefined)).toBeUndefined();
  });
});
