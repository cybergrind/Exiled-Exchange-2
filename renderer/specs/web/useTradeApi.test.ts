import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemFilters } from "@/web/price-check/filters/interfaces";
import { ParsedItem } from "@/parser";
import { useTradeApi } from "@/web/price-check/trade/trade-api";
import {
  createTradeRequest,
  PricingResult,
  requestResults,
  requestTradeResultList,
} from "@/web/price-check/trade/pathofexile-trade";
import {
  CHAOS_FILL_BELOW,
  LIQUID_CURRENCY,
} from "@/web/price-check/trade/liquidCurrency";
import { setupTests } from "@specs/vitest.setup";
import { init } from "@/assets/data";

vi.mock("@/web/price-check/trade/pathofexile-trade", () => {
  return {
    createTradeRequest: vi.fn(),
    requestTradeResultList: vi.fn(),
    requestResults: vi.fn(),
  };
});

describe("useTradeApi", () => {
  let composableResult: ReturnType<typeof useTradeApi>;

  beforeEach(async () => {
    setupTests();
    await init("en");
    composableResult = useTradeApi();
    vi.clearAllMocks();
  });

  it("initializes error and results as empty", () => {
    expect(composableResult.error.value).toBeNull();
    expect(composableResult.searchResult.value).toBeNull();
  });

  it("when trade request throws, error is set", async () => {
    vi.mocked(createTradeRequest).mockImplementation(() => {
      throw new Error("test");
    });

    expect(composableResult.error.value).toBeNull();
    await composableResult.search({} as ItemFilters, [], {} as ParsedItem);
    expect(composableResult.error.value).toBe("test");
    expect(createTradeRequest).toHaveBeenCalled();
  });

  it.each([
    [1, 1],
    [10, 1],
    [11, 2],
    [20, 2],
    [21, 3],
  ])(
    "%#. when result list has %i result(s), requestResults is called %i time(s)",
    async (resultCount, expectedCalls) => {
      vi.mocked(createTradeRequest).mockReturnValue(
        {} as ReturnType<typeof createTradeRequest>,
      );
      vi.mocked(requestTradeResultList).mockResolvedValue({
        id: "test",
        result: Array.from({ length: resultCount }, (_, i) => `test-${i}`),
        total: resultCount,
        inexact: false,
      });
      vi.mocked(requestResults).mockResolvedValue([
        {} as unknown as PricingResult,
      ]);

      expect(composableResult.error.value).toBeNull();
      await composableResult.search(
        { trade: { league: "test" } } as ItemFilters,
        [],
        {} as ParsedItem,
      );
      expect(composableResult.error.value).toBeNull();
      expect(requestResults).toHaveBeenCalledTimes(expectedCalls);
    },
  );

  describe("liquid currencies (Exalted or Divine, then Chaos)", () => {
    const listing = (id: string, priceCurrency: string) =>
      ({ id, priceCurrency, priceAmount: 1, accountName: id }) as PricingResult;

    function mockSearches(exDivTotal: number) {
      vi.mocked(createTradeRequest).mockImplementation(
        (filters) =>
          ({ currency: filters.trade.currency }) as unknown as ReturnType<
            typeof createTradeRequest
          >,
      );
      vi.mocked(requestTradeResultList).mockImplementation(async (request) => {
        const chaos =
          (request as unknown as { currency: string }).currency === "chaos";
        const total = chaos ? 2 : exDivTotal;
        return {
          id: chaos ? "chaos-search" : "exdiv-search",
          result: Array.from({ length: total }, (_, i) => `r${i}`),
          total,
          inexact: false,
        };
      });
      vi.mocked(requestResults).mockImplementation(async (queryId) =>
        queryId === "chaos-search"
          ? [listing("c1", "chaos"), listing("c2", "chaos")]
          : [listing("e1", "exalted")],
      );
    }

    const search = (currency: string) =>
      composableResult.search(
        { trade: { league: "test", currency } } as ItemFilters,
        [],
        {} as ParsedItem,
      );

    it("adds a chaos-only search when Exalted or Divine finds few", async () => {
      mockSearches(1);
      await search(LIQUID_CURRENCY);
      expect(composableResult.error.value).toBeNull();
      const currencies = vi
        .mocked(createTradeRequest)
        .mock.calls.map(([filters]) => filters.trade.currency);
      expect(currencies).toEqual([LIQUID_CURRENCY, "chaos"]);
      expect(
        composableResult.groupedResults.value.map((r) => r.id).sort(),
      ).toEqual(["c1", "c2", "e1"]);
      // The trade link stays on the Exalted or Divine search.
      expect(composableResult.searchResult.value?.id).toBe("exdiv-search");
      expect(composableResult.searchResult.value?.total).toBe(3);
    });

    it("skips the chaos search when Exalted or Divine finds enough", async () => {
      mockSearches(CHAOS_FILL_BELOW);
      await search(LIQUID_CURRENCY);
      expect(createTradeRequest).toHaveBeenCalledTimes(1);
    });

    it("never adds one for a currency the user picked", async () => {
      mockSearches(1);
      await search("exalted_divine");
      expect(createTradeRequest).toHaveBeenCalledTimes(1);
    });
  });
});
