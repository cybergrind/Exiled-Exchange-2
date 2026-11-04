import { ParsedItem } from "@/parser";
import { AppConfig } from "@/web/Config";
import { shallowRef, computed, shallowReactive } from "vue";
import { ItemFilters, StatFilter } from "../filters/interfaces";
import {
  SearchResult,
  PricingResult,
  createTradeRequest,
  requestTradeResultList,
  requestResults,
} from "@/web/price-check/trade/pathofexile-trade";
import { usePoeninja } from "@/web/background/Prices";
import { mergeByValue, needsChaosSearch } from "./liquidCurrency";

const API_FETCH_LIMIT = 100;
const MIN_NOT_GROUPED = 7;
const MIN_GROUPED = 10;

export function useTradeApi() {
  let searchId = 0;
  const error = shallowRef<string | null>(null);
  const searchResult = shallowRef<SearchResult | null>(null);
  const fetchResults = shallowRef<PricingResult[]>([]);

  const groupedResults = computed(() => {
    const out: Array<PricingResult & { listedTimes: number }> = [];
    for (const result of fetchResults.value) {
      if (result == null) break;
      if (out.length === 0) {
        out.push({ listedTimes: 1, ...result });
        continue;
      }
      const existingRes = out.find(
        (added, idx) =>
          (added.accountName === result.accountName &&
            added.priceCurrency === result.priceCurrency &&
            added.priceAmount === result.priceAmount) ||
          (added.accountName === result.accountName && out.length - idx <= 2), // last or prev
      );
      if (existingRes) {
        if (existingRes.stackSize) {
          existingRes.stackSize += result.stackSize!;
        } else {
          existingRes.listedTimes += 1;
        }
      } else {
        out.push({ listedTimes: 1, ...result });
      }
    }
    return out;
  });

  async function search(
    filters: ItemFilters,
    stats: StatFilter[],
    item: ParsedItem,
  ) {
    try {
      searchId += 1;
      error.value = null;
      searchResult.value = null;
      const _fetchResults: PricingResult[] = shallowReactive([]);
      fetchResults.value = _fetchResults;

      const _searchId = searchId;
      const request = createTradeRequest(filters, stats, item);
      const _searchResult = await requestTradeResultList(
        request,
        filters.trade.league,
      );
      if (_searchId !== searchId) {
        return;
      }
      searchResult.value = _searchResult;

      // first two req are parallel, then sequential on demand
      {
        const r1 =
          _searchResult.result.length > 0
            ? requestResults(
                _searchResult.id,
                _searchResult.result.slice(0, 10),
                { accountName: AppConfig().accountName },
              ).then((results) => {
                _fetchResults.push(...results);
              })
            : Promise.resolve();
        const r2 =
          _searchResult.result.length > 10
            ? requestResults(
                _searchResult.id,
                _searchResult.result.slice(10, 20),
                { accountName: AppConfig().accountName },
              ).then(async (results) => {
                await r1.then(() => {
                  _fetchResults.push(...results);
                });
              })
            : Promise.resolve();
        await Promise.all([r1, r2]);
      }

      let fetched = 20;
      async function fetchMore(): Promise<void> {
        if (_searchId !== searchId) return;
        const totalGrouped = groupedResults.value.length;
        const totalNotGrouped = groupedResults.value.reduce(
          (len, res) => (res.listedTimes <= 2 ? len + 1 : len),
          0,
        );
        if (
          (totalNotGrouped < MIN_NOT_GROUPED || totalGrouped < MIN_GROUPED) &&
          fetched < _searchResult.result.length &&
          fetched < API_FETCH_LIMIT
        ) {
          await requestResults(
            _searchResult.id,
            _searchResult.result.slice(fetched, fetched + 10),
            { accountName: AppConfig().accountName },
          ).then((results) => {
            _fetchResults.push(...results);
          });
          fetched += 10;
          await fetchMore();
        }
      }
      await fetchMore();

      // Exalted or Divine found few: fill in with a Chaos-only search.
      if (needsChaosSearch(filters.trade.currency, _searchResult.total)) {
        await addChaosListings(filters, stats, item, _searchId, _fetchResults);
      }
    } catch (err) {
      error.value = (err as Error).message;
    }
  }

  async function addChaosListings(
    filters: ItemFilters,
    stats: StatFilter[],
    item: ParsedItem,
    _searchId: number,
    exDivResults: PricingResult[],
  ) {
    const exDivSearch = searchResult.value!;
    let chaosResults: PricingResult[] = [];
    let chaosSearch: SearchResult;
    try {
      chaosSearch = await requestTradeResultList(
        createTradeRequest(
          { ...filters, trade: { ...filters.trade, currency: "chaos" } },
          stats,
          item,
        ),
        filters.trade.league,
      );
      const ids = chaosSearch.result.slice(0, 20);
      for (let i = 0; i < ids.length; i += 10) {
        if (_searchId !== searchId) return;
        chaosResults.push(
          ...(await requestResults(chaosSearch.id, ids.slice(i, i + 10), {
            accountName: AppConfig().accountName,
          })),
        );
      }
    } catch (err) {
      // The Exalted or Divine listings stand on their own.
      console.warn("Chaos-only search failed:", err);
      return;
    }
    if (_searchId !== searchId) return;
    chaosResults = chaosResults.filter((r) => r != null);
    fetchResults.value = mergeByValue(
      exDivResults.filter((r) => r != null),
      chaosResults,
      divineValueOfListing,
    );
    // The trade link keeps opening the Exalted or Divine search.
    searchResult.value = {
      ...exDivSearch,
      total: exDivSearch.total + chaosSearch.total,
      inexact: exDivSearch.inexact || chaosSearch.inexact,
    };
  }

  return { error, searchResult, groupedResults, search };
}

/** A listing's price in divines, for the liquid currencies only. */
export function divineValueOfListing(
  result: PricingResult,
): number | undefined {
  const name =
    result.priceCurrency === "exalted"
      ? "Exalted Orb"
      : result.priceCurrency === "chaos"
        ? "Chaos Orb"
        : undefined;
  if (result.priceCurrency === "divine") return result.priceAmount;
  if (!name) return undefined;
  const perOrb = usePoeninja().divineValueByQuery({
    ns: "ITEM",
    name,
    variant: undefined,
  });
  return perOrb === undefined ? undefined : perOrb * result.priceAmount;
}
