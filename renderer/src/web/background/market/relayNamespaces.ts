// The relay's namespaceMap.json (api.exiledexchange2.dev/proxy/data/), as
// recorded on 2026-11-02 (specs/fixtures/market/relay-namespace-map.json; a
// test keeps the two equal). The snapshot stores the overview but not this
// map, so a start with the relay unreachable reads the snapshot with it, and
// a load whose map request fails falls back to it. Erasable TypeScript only.

export interface RelayNamespace {
  ns: "ITEM" | "GEM" | "UNIQUE";
  cx: boolean;
  url: string;
  type: string;
}

export interface RelayNamespaceMap {
  schemaVersion: 1;
  map: RelayNamespace[];
}

export const RELAY_NAMESPACE_MAP: RelayNamespaceMap = {
  schemaVersion: 1,
  map: [
    { ns: "ITEM", cx: true, url: "currency", type: "Currency" },
    { ns: "ITEM", cx: true, url: "fragments", type: "Fragments" },
    { ns: "ITEM", cx: true, url: "abyssal-bones", type: "Abyss" },
    { ns: "ITEM", cx: true, url: "uncut-gems", type: "UncutGems" },
    {
      ns: "GEM",
      cx: true,
      url: "lineage-support-gems",
      type: "LineageSupportGems",
    },
    { ns: "ITEM", cx: true, url: "essences", type: "Essences" },
    { ns: "ITEM", cx: true, url: "soul-cores", type: "Ultimatum" },
    { ns: "ITEM", cx: true, url: "idols", type: "Idols" },
    { ns: "ITEM", cx: true, url: "runes", type: "Runes" },
    { ns: "ITEM", cx: true, url: "omens", type: "Ritual" },
    { ns: "ITEM", cx: true, url: "expedition", type: "Expedition" },
    { ns: "ITEM", cx: true, url: "distilled-emotions", type: "Delirium" },
    { ns: "ITEM", cx: true, url: "breach-catalyst", type: "Breach" },
    { ns: "ITEM", cx: true, url: "verisium", type: "Verisium" },
    { ns: "UNIQUE", cx: false, url: "unique-weapons", type: "UniqueWeapons" },
    { ns: "UNIQUE", cx: false, url: "unique-armours", type: "UniqueArmours" },
    {
      ns: "UNIQUE",
      cx: false,
      url: "unique-accessories",
      type: "UniqueAccessories",
    },
    { ns: "UNIQUE", cx: false, url: "unique-flasks", type: "UniqueFlasks" },
    { ns: "UNIQUE", cx: false, url: "unique-charms", type: "UniqueCharms" },
    { ns: "UNIQUE", cx: false, url: "unique-jewels", type: "UniqueJewels" },
    { ns: "UNIQUE", cx: false, url: "unique-tablets", type: "UniqueTablets" },
    {
      ns: "UNIQUE",
      cx: false,
      url: "unique-relics",
      type: "UniqueSanctumRelics",
    },
    {
      ns: "ITEM",
      cx: false,
      url: "precursor-tablets",
      type: "PrecursorTablets",
    },
  ],
};
