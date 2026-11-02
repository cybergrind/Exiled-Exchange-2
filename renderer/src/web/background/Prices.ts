import { shallowRef, watch, readonly, computed } from "vue";
import { createGlobalState } from "@vueuse/core";
import { Host } from "@/web/background/IPC";
import { useLeagues } from "./Leagues";
import { useUniqueLines } from "./uniquesStore";
import { useMarket } from "./marketStore";
import type { MarketLoadResult } from "./marketStore";
import { RELAY_NAMESPACE_MAP } from "./market/relayNamespaces.ts";
import { SNAPSHOT_VERSION } from "./market/snapshot.ts";
import type { Snapshot, SnapshotRelay } from "./market/snapshot.ts";
import {
  appendHistoryFile,
  historyLines,
  isUsableBootSnapshot,
  overviewText,
  readSnapshotFile,
  SYNC_INTERVAL_MS,
  writeSnapshotFile,
} from "./market/sync.ts";
import type { FetchLike } from "./market/sync.ts";
import { AppConfig } from "../Config";
import { PriceCheckWidget } from "../overlay/widgets";
import {
  DropEntry,
  ITEM_BY_REF,
  ITEM_DROP as BUNDLED_ITEM_DROP,
} from "@/assets/data";

export type NinjaSchema = NinjaSchemaV1;
type NinjaSchemaV1 = {
  schemaVersion: 1;
  map: Array<{
    ns: "ITEM" | "GEM" | "UNIQUE";
    cx: boolean;
    url: string;
    type: string;
  }>;
};

interface NinjaDenseExchangeInfo {
  name: string;
  variant?: string;
  primaryValue: number;
  detailsId: string;
  id: string;
  volumePrimaryValue: number;
  maxVolumeCurrency: string;
  maxVolumeRate: number;
  sparkline: {
    totalChange: number;
    data: Array<number | null>;
  };
}

interface NinjaDenseStashInfo {
  name: string;
  variant?: string;
  primaryValue: number;
  detailsId: string;
  sparkline: {
    totalChange: number;
    data: Array<number | null>;
  };
}

interface NinjaXchgRates {
  rates: Record<string, number>;
  primary: string;
  secondary: string;
}

type PriceDatabase = Array<{
  // My namespace for searching
  ns: string;
  // If db is from the currency exchange (cx)
  cx: boolean;
  // base url on ninja
  url: string;
  // json blob data
  lines: string;
  // poe.ninja overview type, e.g. "Ritual"
  type: string;
}>;

/** One poe.ninja category, for the ladder (guide/poe-source.html, D6). */
export interface CategoryLines {
  type: string;
  lines: Array<{
    name: string;
    variant?: string;
    primaryValue: number;
    totalChange?: number;
  }>;
}

/** The first complete JSON object in `text`; the rest is ignored. */
function firstJsonObject(text: string): unknown {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(0, i + 1));
    }
  }
  throw new Error("No complete JSON object");
}
const RETRY_INTERVAL_MS = 4 * 60 * 1000;
// Hourly (guide/poe-source.html, D4 and WP-24): the relay's data and the
// Currency Exchange feed both change once an hour, so a 31-minute refresh
// fetched the same relay data every other time; each refresh now also
// rewrites the snapshot. Failed refreshes still retry every 4 minutes.
const UPDATE_INTERVAL_MS = SYNC_INTERVAL_MS;
const INTEREST_SPAN_MS = 20 * 60 * 1000;

// main's /market/ route on the local server. Looked up per call, not bound.
const localFetch: FetchLike = (url, init) => fetch(url, init);

interface DbQuery {
  ns: string;
  name: string;
  variant?: string;
}

export interface CurrencyValue {
  min: number;
  max: number;
  currency: "chaos" | "exalted" | "div";
}

export interface CoreCurrency {
  id: "exalted" | "chaos" | "div";
  abbrev: string;
  ref: string;
  text: string;
  icon: string;
}

function getAvailableCoreCurrencies(): CoreCurrency[] {
  return [
    {
      id: "exalted",
      abbrev: "ex",
      ref: "Exalted Orb",
      text: "Exalted Orb",
      icon: "/images/exa.png",
    },
    {
      id: "chaos",
      abbrev: "c",
      ref: "Chaos Orb",
      text: "Chaos Orb",
      icon: "/images/chaos.png",
    },
  ];
}
export const DivCurrency: CoreCurrency = {
  id: "div",
  abbrev: "div",
  ref: "Divine Orb",
  text: "Divine Orb",
  icon: "/images/div.png",
};

export const usePoeninja = createGlobalState(() => {
  const leagues = useLeagues();
  const market = useMarket();

  // TODO: move out of here
  const ITEM_DROP = shallowRef<DropEntry[]>([]);

  const availableCoreCurrencies = shallowRef<CoreCurrency[]>([]);
  const selectedCoreCurrencyId = computed<"exalted" | "chaos">({
    get() {
      return availableCoreCurrencies.value.length
        ? AppConfig<PriceCheckWidget>("price-check")!.coreCurrency
        : "exalted";
    },
    set(id) {
      AppConfig<PriceCheckWidget>("price-check")!.coreCurrency = id;
    },
  });

  const selectedCoreCurrency = computed(() => {
    const { coreCurrency } = AppConfig<PriceCheckWidget>("price-check")!;
    if (!availableCoreCurrencies.value || !coreCurrency) return undefined;
    const listed = availableCoreCurrencies.value.find(
      (currency) => currency.id === coreCurrency,
    );
    return listed;
  });

  /**
   * core/div
   */
  const xchgRate = shallowRef<number | undefined>(undefined);
  /**
   * Current core currency
   */
  const xchgRateCurrency = shallowRef<"chaos" | "exalted" | undefined>(
    undefined,
  );

  const isLoading = shallowRef(false);
  let PRICES_DB: PriceDatabase = [];
  let lastUpdateTime = 0;
  let downloadController: AbortController | undefined;
  let lastInterestTime = 0;
  // The league whose snapshot was last read at start (WP-23).
  let bootedLeague: string | undefined;
  // The relay overview behind PRICES_DB, kept for the snapshot (WP-24).
  let relayState:
    | { league: string; text: string; fetchedAt: string; etag?: string }
    | undefined;
  const uniques = useUniqueLines();

  let priceCache = new Map<string, CurrencyValue>();
  // PRICES_DB is not reactive; this counts its replacements so computed
  // values that read it (the ladder) rerun when prices arrive.
  const dbVersion = shallowRef(0);
  let categoryCache = new Map<string, CategoryLines>();
  function setPricesDb(db: PriceDatabase) {
    PRICES_DB = db;
    categoryCache = new Map();
    dbVersion.value++;
  }
  // Exchange rates arrive separately from poe.ninja's; either invalidates.
  watch(market.table, () => {
    priceCache = new Map<string, CurrencyValue>();
  });

  async function load(force: boolean = false) {
    const league = leagues.selected.value;
    if (!league || !league.isPopular || league.realm !== "pc-ggg") return;
    if (bootedLeague !== league.id) {
      bootedLeague = league.id;
      await boot(league.id);
    }
    if (
      !force &&
      (Date.now() - lastUpdateTime < UPDATE_INTERVAL_MS ||
        Date.now() - lastInterestTime > INTEREST_SPAN_MS)
    )
      return;
    if (downloadController) downloadController.abort();
    // GGG Currency Exchange prices: their own cache and failure handling.
    const cxLoad = market.load(league.id).catch((e) => {
      console.warn(e);
      return undefined;
    });
    // poe.ninja unique lines (WP-50): at most hourly, on their own.
    const uniquesLoad = uniques.refresh(league.id).catch((e) => {
      console.warn(e);
      return false;
    });
    let relayOk = false;
    try {
      isLoading.value = true;
      downloadController = new AbortController();

      try {
        ITEM_DROP.value = JSON.parse(
          await Host.proxy(
            "api.exiledexchange2.dev/proxy/data/item-drop.json",
            { signal: downloadController.signal },
          ).then((r) => r.text()),
        );
      } catch (e) {
        // The drop list is a side table; prices must not wait on it.
        if (downloadController.signal.aborted) throw e;
        console.warn("Using the bundled drop list:", e);
        ITEM_DROP.value = BUNDLED_ITEM_DROP ?? [];
      }

      setupCoreCurrencies();

      let ninjaSchema: NinjaSchema;
      try {
        ninjaSchema = JSON.parse(
          await Host.proxy(
            "api.exiledexchange2.dev/proxy/data/namespaceMap.json",
            {
              signal: downloadController.signal,
            },
          ).then((r) => r.text()),
        );
      } catch (e) {
        if (downloadController.signal.aborted) throw e;
        console.warn("Using the recorded namespace map:", e);
        ninjaSchema = RELAY_NAMESPACE_MAP;
      }
      const response = await Host.proxy(
        `api.exiledexchange2.dev/proxy/${selectedLeagueToUrl(true)}/overviewData.json`,
        {
          signal: downloadController.signal,
          // The relay sends max-age=14400. Without this, every refresh inside
          // one app run reads the browser cache for up to 4 hours.
          cache: "no-cache",
        },
      );
      if (!response.ok) throw new Error(`Relay: HTTP ${response.status}`);
      const jsonBlob = await response.text();

      applyRelay(jsonBlob, ninjaSchema);
      relayState = {
        league: league.id,
        text: jsonBlob,
        fetchedAt: new Date().toISOString(),
        etag: response.headers?.get("etag") ?? undefined,
      };

      lastUpdateTime = Date.now();
      relayOk = true;
    } catch (e) {
      console.warn(e);
    } finally {
      isLoading.value = false;
    }

    const cx = await cxLoad;
    const uniquesNew = await uniquesLoad;
    if (relayOk || cx?.fetched.length || uniquesNew) {
      await persist(league.id, cx);
    }
  }

  function setupCoreCurrencies() {
    availableCoreCurrencies.value = getAvailableCoreCurrencies().map(
      (currency) => ({
        ...currency,
        text: ITEM_BY_REF("ITEM", currency.ref)![0].name,
      }),
    );
    const haveCurrency = availableCoreCurrencies.value.some(
      (currency) => currency.id === selectedCoreCurrencyId.value,
    );
    if (!haveCurrency) {
      selectedCoreCurrencyId.value = "exalted";
    }
  }

  /** Makes a relay overview (its text form) the price database. */
  function applyRelay(jsonBlob: string, ninjaSchema: NinjaSchema) {
    const ninjaXchg = parseXchg(jsonBlob);

    setPricesDb(splitJsonBlob(jsonBlob, ninjaSchema));

    // TODO: update to search for requested currency instead of divine
    const divineRates = ninjaXchg.rates;
    const preferred = selectedCoreCurrency.value;

    if (divineRates && Object.values(divineRates).some((v) => v >= 10)) {
      if (
        preferred &&
        preferred.id !== "div" &&
        divineRates[preferred.id] >= 5
      ) {
        xchgRate.value = divineRates[preferred.id];
        xchgRateCurrency.value = preferred.id;
      } else {
        xchgRate.value = divineRates.exalted;
        xchgRateCurrency.value = "exalted";
      }
    }

    // Clear cache
    priceCache = new Map<string, CurrencyValue>();
  }

  /**
   * WP-23: the league's snapshot from user data, so the first price check
   * has prices (with their age) before, or without, the network. Used only
   * if it is this league's and under 6 hours old; the refresh still runs.
   */
  async function boot(leagueId: string) {
    const snapshot = await readSnapshotFile(localFetch, leagueId);
    if (!isUsableBootSnapshot(snapshot, leagueId, Date.now())) return;
    if (leagues.selectedId.value !== leagueId) return;

    if (snapshot.uniques) uniques.restore(leagueId, snapshot.uniques);
    // Queued ahead of the refresh's own load, which replaces it when it can.
    if (snapshot.cx) market.restore(leagueId, snapshot.cx);
    if (snapshot.relay && !PRICES_DB.length) {
      try {
        const text = overviewText(snapshot.relay.overview);
        if (!ITEM_DROP.value.length) ITEM_DROP.value = BUNDLED_ITEM_DROP ?? [];
        setupCoreCurrencies();
        applyRelay(text, RELAY_NAMESPACE_MAP);
        relayState = {
          league: leagueId,
          text,
          fetchedAt: snapshot.relay.fetchedAt,
          etag: snapshot.relay.etag,
        };
      } catch (e) {
        console.warn("Ignoring the saved relay overview:", e);
      }
    }
  }

  /**
   * WP-24: after a refresh, rewrite the snapshot (D4 schema) and append the
   * hours fetched just now to the history, through main's route.
   */
  async function persist(leagueId: string, cx: MarketLoadResult | undefined) {
    if (leagues.selectedId.value !== leagueId) return;
    let relay: SnapshotRelay | null = null;
    if (relayState?.league === leagueId) {
      try {
        relay = {
          fetchedAt: relayState.fetchedAt,
          etag: relayState.etag,
          overview: JSON.parse(relayState.text),
        };
      } catch {
        relay = null;
      }
    }
    const cxBlock = market.snapshotCx(leagueId);
    if (!relay && !cxBlock) return;

    const snapshot: Snapshot = {
      schemaVersion: SNAPSHOT_VERSION,
      league: leagueId,
      writtenAt: new Date().toISOString(),
      cx: cxBlock,
      relay,
    };
    const uniquesBlock = uniques.snapshotBlock(leagueId);
    if (uniquesBlock) snapshot.uniques = uniquesBlock;
    try {
      await writeSnapshotFile(localFetch, snapshot);
    } catch (e) {
      console.warn(e);
    }
    if (cx?.league !== leagueId) return;
    try {
      await appendHistoryFile(
        localFetch,
        leagueId,
        historyLines(cx.fetched, leagueId),
      );
    } catch (e) {
      console.warn(e);
    }
  }

  function queuePricesFetch() {
    lastInterestTime = Date.now();
    load();
  }

  function selectedLeagueToUrl(proxy: boolean): string {
    const league = leagues.selectedId.value!;
    switch (league) {
      case "Standard":
        return "standard";
      case "Hardcore":
        return "hardcore";
    }
    if (proxy) {
      return league;
    }

    const ninjaLeague = league.toLowerCase().replaceAll(" ", "");
    if (ninjaLeague.startsWith("hc")) {
      return ninjaLeague.slice(2) + "hc";
    }
    return ninjaLeague;
  }

  /**
   * The exchange category holding the item, with every line in it. With
   * `family`, an item poe.ninja does not list is placed by another tier of
   * it: "Essence of the Infinite" by "Greater Essence of the Infinite".
   */
  function categoryLines(
    query: { ns: string; name: string },
    opts: { family?: boolean } = {},
  ): CategoryLines | undefined {
    // Reading dbVersion makes a computed caller rerun when prices arrive.
    if (dbVersion.value === 0 || !PRICES_DB.length) return undefined;
    const quoted = JSON.stringify(query.name);
    const needle = `{"name":${quoted},`;
    const tierNeedle = ` ${quoted.slice(1)},`;
    const entry =
      PRICES_DB.find(
        (db) => db.cx && db.ns === query.ns && db.lines.includes(needle),
      ) ??
      (opts.family
        ? PRICES_DB.find(
            (db) =>
              db.cx && db.ns === query.ns && db.lines.includes(tierNeedle),
          )
        : undefined);
    if (!entry) return undefined;
    return parsedCategory(entry);
  }

  /** Every line of one poe.ninja overview type, e.g. "PrecursorTablets". */
  function overviewLines(type: string): CategoryLines | undefined {
    if (dbVersion.value === 0 || !PRICES_DB.length) return undefined;
    const entry = PRICES_DB.find((db) => db.type === type);
    return entry ? parsedCategory(entry) : undefined;
  }

  function parsedCategory(entry: PriceDatabase[number]): CategoryLines {
    let category = categoryCache.get(entry.type);
    if (!category) {
      const overview = firstJsonObject(entry.lines) as {
        lines: Array<{
          name: string;
          variant?: string;
          primaryValue: number;
          sparkline?: { totalChange?: number };
        }>;
      };
      category = {
        type: entry.type,
        lines: overview.lines.map((line) => ({
          name: line.name,
          variant: line.variant,
          primaryValue: line.primaryValue,
          totalChange: line.sparkline?.totalChange,
        })),
      };
      categoryCache.set(entry.type, category);
    }
    return category;
  }

  function findPriceByQuery(query: DbQuery) {
    // NOTE: order of keys is important
    const searchString = JSON.stringify({
      name: query.name,
      variant: query.variant,
      primaryValue: 0,
    }).replace(":0}", ":");
    const endSearchString = "}}";

    for (const { ns, cx, url, lines } of PRICES_DB) {
      if (ns !== query.ns) continue;

      const startPos = lines.indexOf(searchString);
      if (startPos === -1) continue;
      const endPos = lines.indexOf(endSearchString, startPos);

      const info: NinjaDenseExchangeInfo | NinjaDenseStashInfo = JSON.parse(
        lines.slice(startPos, endPos + endSearchString.length),
      );

      return {
        ...info,
        cx,
        url: `https://poe.ninja/poe2/economy/${selectedLeagueToUrl(false)}/${url}/${info.detailsId}`,
      };
    }
    return null;
  }

  /**
   * Converts item value from divines to current core currency
   * @param value item value in divines
   * @returns Value in core currency or div
   */
  function autoCurrency(
    value: number | [number, number],
    coreOnly: boolean = false,
  ): CurrencyValue {
    if (Array.isArray(value)) {
      const coreValue = value.map(divineToCore);
      if (coreValue[0] > (xchgRate.value || 9999) && !coreOnly) {
        return {
          min: value[0],
          max: value[1],
          currency: "div",
        };
      }
      if (selectedCoreCurrency.value?.id) {
        return {
          min: coreValue[0],
          max: coreValue[1],
          currency: selectedCoreCurrency.value.id,
        };
      }
      // this should never run, assuming we have loaded a currency
      return { min: value[0], max: value[1], currency: "div" };
    }
    const coreValue = divineToCore(value);
    if (coreValue > (xchgRate.value || 9999) * 0.94 && !coreOnly) {
      if (coreValue < (xchgRate.value || 9999) * 1.06) {
        return { min: 1, max: 1, currency: "div" };
      } else {
        return {
          min: value,
          max: value,
          currency: "div",
        };
      }
    }
    if (selectedCoreCurrency.value?.id) {
      return {
        min: coreValue,
        max: coreValue,
        currency: selectedCoreCurrency.value.id,
      };
    }
    // this should never run, assuming we have loaded a currency
    return { min: value, max: value, currency: "div" };
  }

  function divineToCore(count: number) {
    return count * (xchgRate.value || 9999);
  }

  /**
   * An item's value in divines, the unit every sum and comparison here uses.
   * Exchange items take the Currency Exchange rate (guide/poe-source.html,
   * D2), expressed in divines with poe.ninja's rate so that autoCurrency
   * turns it back into exactly that rate; others take poe.ninja's value.
   */
  function divineValueByQuery(query: DbQuery): number | undefined {
    const entry = findPriceByQuery(query);
    const core = xchgRateCurrency.value === "chaos" ? "chaos" : "exalted";
    const exchange = market.valueFor(
      query.ns,
      query.name,
      core,
      entry ?? undefined,
    );
    if (
      exchange?.source === "ggg" &&
      Number.isFinite(exchange.ordering) &&
      xchgRate.value &&
      xchgRateCurrency.value === core
    ) {
      return exchange.ordering / xchgRate.value;
    }
    return entry?.primaryValue;
  }

  function cachedCurrencyByQuery(query: DbQuery, count: number) {
    // variant should always be undefined for currencies
    const key = `${query.ns}:${query.name}:${query.variant ?? ""}:${count}`;
    if (priceCache.has(key)) {
      return priceCache.get(key)!;
    }

    const value = divineValueByQuery(query);
    if (value === undefined) {
      return;
    }
    const currency = autoCurrency(value * count);
    priceCache.set(key, currency);
    return currency;
  }

  function toDivine(value: CurrencyValue): CurrencyValue {
    if (value.currency === "div") return value;
    if (xchgRate.value) {
      if (xchgRateCurrency.value !== value.currency) {
        throw new Error(
          `Cannot convert ${value.currency} to div, current core currency is ${xchgRateCurrency.value}`,
        );
      }

      return {
        min: value.min / xchgRate.value,
        max: value.max / xchgRate.value,
        currency: "div",
      };
    }
    return value;
  }

  function addPrice(
    addend1: CurrencyValue,
    addend2: CurrencyValue,
  ): CurrencyValue {
    const addend1Div = toDivine(addend1);
    const addend2Div = toDivine(addend2);

    return autoCurrency([
      addend1Div.min + addend2Div.min,
      addend1Div.max + addend2Div.max,
    ]);
  }

  function subtractPrice(
    minuend: CurrencyValue,
    subtrahend: CurrencyValue,
  ): CurrencyValue {
    const minuendDiv = toDivine(minuend);
    const subtrahendDiv = toDivine(subtrahend);

    return autoCurrency([
      minuendDiv.min - subtrahendDiv.max,
      minuendDiv.max - subtrahendDiv.min,
    ]);
  }

  function comparePrice(
    left: CurrencyValue,
    op: ">" | ">=" | "==" | "===" | "<=" | "<",
    right: CurrencyValue,
  ): boolean {
    const leftDiv = toDivine(left);
    const rightDiv = toDivine(right);

    switch (op) {
      case ">":
        return leftDiv.min > rightDiv.max;
      case ">=":
        return leftDiv.min >= rightDiv.max;
      case "==":
        return leftDiv.min === rightDiv.max && leftDiv.max === rightDiv.min;
      case "===":
        return (
          left.currency === right.currency &&
          leftDiv.min === rightDiv.max &&
          leftDiv.max === rightDiv.min
        );
      case "<=":
        return leftDiv.max <= rightDiv.min;
      case "<":
        return leftDiv.max < rightDiv.min;
    }
  }

  setInterval(() => {
    load();
  }, RETRY_INTERVAL_MS);

  watch(leagues.selectedId, () => {
    xchgRate.value = undefined;
    setPricesDb([]);
    load(true);
  });

  watch(selectedCoreCurrencyId, (curr, prev) => {
    if (curr === prev) return;
    xchgRateCurrency.value = curr ?? "exalted";
    xchgRate.value = undefined;
    setPricesDb([]);
    load(true);
  });

  return {
    xchgRate: readonly(xchgRate),
    xchgRateCurrency: readonly(selectedCoreCurrency),
    findPriceByQuery,
    categoryLines,
    overviewLines,
    divineValueByQuery,
    autoCurrency,
    queuePricesFetch,
    cachedCurrencyByQuery,
    initialLoading: () => isLoading.value && !PRICES_DB.length,
    availableCoreCurrencies: readonly(availableCoreCurrencies),
    ITEM_DROP,
    // math
    addPrice,
    subtractPrice,
    comparePrice,
  };
});

function parseXchg(jsonBlob: string): NinjaXchgRates {
  const RATES = '{"rates":';
  const END_RATES = '"}';
  const startPos = jsonBlob.indexOf(RATES);
  const endPos = jsonBlob.indexOf(END_RATES, startPos) + END_RATES.length;
  return JSON.parse(jsonBlob.slice(startPos, endPos));
}

function splitJsonBlob(jsonBlob: string, schema: NinjaSchema): PriceDatabase {
  const NINJA_OVERVIEW = '{"type":"';
  if (schema.schemaVersion !== 1) {
    console.warn("Unsupported ninja schema version", schema.schemaVersion);
    return [];
  }
  const NAMESPACE_MAP: Array<{
    ns: string;
    cx: boolean;
    url: string;
    type: string;
  }> = schema.map;

  const database: PriceDatabase = [];
  let startPos = jsonBlob.indexOf(NINJA_OVERVIEW);
  if (startPos === -1) return [];

  while (true) {
    const endPos = jsonBlob.indexOf(NINJA_OVERVIEW, startPos + 1);

    const type = jsonBlob.slice(
      startPos + NINJA_OVERVIEW.length,
      jsonBlob.indexOf('"', startPos + NINJA_OVERVIEW.length),
    );
    const lines = jsonBlob.slice(
      startPos,
      endPos === -1 ? jsonBlob.length : endPos,
    );

    const isSupported = NAMESPACE_MAP.find((entry) => entry.type === type);
    if (isSupported) {
      database.push({
        ns: isSupported.ns,
        cx: isSupported.cx,
        url: isSupported.url,
        lines,
        type,
      });
    }

    if (endPos === -1) break;
    startPos = endPos;
  }
  return database;
}

export function displayRounding(
  value: number,
  fraction: boolean = false,
  truncateLargeNumbers: boolean = false,
): string {
  if (fraction && Math.abs(value) < 1) {
    if (value === 0) return "0";
    const r = `1\u200A/\u200A${displayRounding(1 / value)}`;
    return r === "1\u200A/\u200A1" ? "1" : r;
  }
  if (Math.abs(value) < 10) {
    return Number(value.toFixed(1)).toString().replace(".", "\u200A.\u200A");
  }
  if (truncateLargeNumbers && Math.abs(value) > 2250) {
    if (Math.abs(value) < 1_050_000) {
      // keep 1 decimal 12324 -> 12.3k
      return (
        Number((value / 1000).toFixed(1))
          .toString()
          .replace(".", "\u200A.\u200A") + "k"
      );
    }
    if (Math.abs(value) < 1_050_000_000) {
      return (
        Number((value / 1_000_000).toFixed(1))
          .toString()
          .replace(".", "\u200A.\u200A") + "m"
      );
    }
    if (Math.abs(value) < 1_050_000_000_000) {
      return (
        Number((value / 1_000_000_000).toFixed(1))
          .toString()
          .replace(".", "\u200A.\u200A") + "b"
      );
    }
    return (
      Number((value / 1_000_000_000_000).toFixed(1))
        .toString()
        .replace(".", "\u200A.\u200A") + "t"
    );
  }
  return Math.round(value).toString();
}

// Disable since this is export for tests
// eslint-disable-next-line @typescript-eslint/naming-convention
export const __testExports = {
  parseXchg,
  splitJsonBlob,
};
