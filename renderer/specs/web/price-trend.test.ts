// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, shallowRef } from "vue";
import { mount } from "@vue/test-utils";
import type { ParsedItem } from "@/parser";
import type { ItemFilters } from "@/web/price-check/filters/interfaces";

// The price panel's headline comes from data already in memory (the snapshot
// read at start, then each background refresh), so it is shown on the first
// render: no spinner, no "Getting price from poe.ninja" while nothing is
// being fetched. A price past STALE_HOURS is dimmed with its age.

const HOUR_MS = 3600_000;
const ETCHER = {
  name: "Arcanist's Etcher",
  primaryValue: 0.01816,
  detailsId: "arcanists-etcher",
  sparkline: { totalChange: 0, data: [] },
  cx: true,
  url: "https://poe.ninja/poe2/economy/x/currency/arcanists-etcher",
};

const state = {
  fetchedAt: shallowRef<number | undefined>(Date.now()),
  asOfHour: shallowRef<number | undefined>(undefined),
  exchange: null as null | {
    source: "ggg";
    value: number;
    currency: "exalted";
  },
  detailsId: { ns: "ITEM", name: "Arcanist's Etcher" } as {
    ns: string;
    name: string;
    variant?: string;
  },
};

vi.mock("@/web/background/Prices", () => ({
  displayRounding: (v: number) => String(v),
  usePoeninja: () => ({
    findPriceByQuery: () => ETCHER,
    autoCurrency: (v: number) => ({
      min: v * 270,
      max: v * 270,
      currency: "exalted",
    }),
    xchgRateCurrency: shallowRef({ id: "exalted" }),
    pricesFetchedAt: state.fetchedAt,
  }),
}));
vi.mock("@/web/background/marketStore", () => ({
  useMarket: () => ({
    valueFor: () => state.exchange,
    pairsFor: () => undefined,
    pairIdFor: () => undefined,
    league: shallowRef(undefined),
    asOfHour: state.asOfHour,
  }),
}));
vi.mock("@/web/background/uniquesStore", () => ({
  useUniqueLines: () => ({
    lineFor: () => undefined,
    tabletLineFor: () => undefined,
  }),
}));
vi.mock("@/web/background/marketHistory", () => ({
  useMarketHistory: () => ({
    ensure: vi.fn(),
    league: shallowRef(undefined),
    points: shallowRef([]),
  }),
}));
vi.mock("@/web/background/uniqueRollsStore", () => ({
  useUniqueRolls: () => ({
    load: async () => undefined,
    builds: shallowRef([]),
    file: shallowRef(undefined),
  }),
}));
vi.mock("@/web/i18n", () => ({
  useI18nNs: () => ({ t: (key: string) => key }),
}));
vi.mock("@/web/price-check/trends/getDetailsId", () => ({
  isValuableBasetype: () => false,
  getDetailsId: () => state.detailsId,
}));
vi.mock("@/web/Config", () => ({
  AppConfig: () => ({ currencyVolume: "none" }),
}));

const ItemQuickPrice = defineComponent({
  props: { price: { type: Object, default: undefined } },
  setup: (props) => () =>
    h(
      "span",
      { "data-headline": "" },
      props.price ? `${props.price.min} ${props.price.currency}` : "",
    ),
});

const ITEM = {
  info: {
    refName: "Arcanist's Etcher",
    icon: "",
    craftable: false,
    unique: undefined,
  },
  category: undefined,
  statsByType: [],
} as unknown as ParsedItem;

async function render(item: ParsedItem = ITEM) {
  const { default: PriceTrend } = await import(
    "@/web/price-check/trends/PriceTrend.vue"
  );
  return mount(PriceTrend, {
    props: { item, filters: {} as ItemFilters },
    global: {
      stubs: {
        ItemQuickPrice,
        "i18n-t": true,
        "VueApexcharts": true,
        "PairRates": true,
        "PriceHistory": true,
        "CoreCurrencyImg": true,
        "UiItemImg": true,
      },
    },
  });
}

describe("PriceTrend", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.fetchedAt.value = Date.now();
    state.asOfHour.value = undefined;
    state.exchange = null;
    state.detailsId = { ns: "ITEM", name: "Arcanist's Etcher" };
  });

  it("shows the in-memory price on the first render", async () => {
    const wrapper = await render();
    expect(wrapper.find(".fa-dna").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("getting_price");
    const headline = wrapper.find("[data-headline]");
    expect(headline.exists()).toBe(true);
    expect(Number(headline.text().split(" ")[0])).toBeCloseTo(4.903, 2);
    expect(wrapper.find("[data-confidence]").exists()).toBe(false);
    vi.useRealTimers();
  });

  it("dims a poe.ninja price over 6 hours old and names its age", async () => {
    state.fetchedAt.value = Date.now() - 9 * HOUR_MS;
    const wrapper = await render();
    expect(wrapper.find("[data-confidence]").text()).toBe(
      "poe.ninja price from 9 h ago",
    );
    expect(wrapper.find("[data-headline]").classes()).toContain("opacity-50");

    // A background refresh lands: the note goes and the price undims.
    state.fetchedAt.value = Date.now();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-confidence]").exists()).toBe(false);
    expect(wrapper.find("[data-headline]").classes()).not.toContain(
      "opacity-50",
    );
    vi.useRealTimers();
  });

  it("ages a Currency Exchange headline by its newest hour", async () => {
    state.exchange = { source: "ggg", value: 4.908, currency: "exalted" };
    // The newest hour ended 8 hours ago; poe.ninja's figure is fresh.
    state.asOfHour.value = Math.floor((Date.now() - 9 * HOUR_MS) / 1000);
    const wrapper = await render();
    expect(wrapper.find("[data-headline]").text()).toBe("4.908 exalted");
    expect(wrapper.find("[data-confidence]").text()).toBe(
      "Currency Exchange rate from 8 h ago",
    );
    vi.useRealTimers();
  });

  it("shows a measured Abyss pair's price and the dated floor", async () => {
    state.detailsId = { ns: "ITEM", name: "Abyss Tablet", variant: "Rare" };
    const stat = (ref: string, value: number) => ({
      stat: { ref },
      sources: [{ contributes: { value } }],
    });
    const tablet = {
      ...ITEM,
      info: { ...ITEM.info, refName: "Abyss Tablet" },
      rarity: "Rare",
      category: "TowerAugment",
      statsByType: [
        stat(
          "Abysses in Map have #% increased chance to lead to an Abyssal Depths",
          15,
        ),
        stat(
          "#% increased chance for Desecrated Currency from Abysses in Map",
          29,
        ),
      ],
    } as unknown as ParsedItem;
    const wrapper = await render(tablet);
    const headline = wrapper.find("[data-tablet-headline]");
    expect(headline.text()).toBe(
      "Always money: Abyssal Depths · Depths + Desecrated: ~3 div (asks, 2026-11-24)",
    );
    expect(headline.attributes("title")).toContain("698 listed");
    expect(wrapper.find("[data-tablet-floor]").text()).toContain(
      "poe.ninja had 0.73 (1.6× higher)",
    );
    vi.useRealTimers();
  });

  it("shows another base's measured set and its dated floor", async () => {
    // T-8: the 2026-11-24 Irradiated study.
    state.detailsId = {
      ns: "ITEM",
      name: "Irradiated Tablet",
      variant: "Rare",
    };
    const tablet = {
      ...ITEM,
      info: { ...ITEM.info, refName: "Irradiated Tablet" },
      rarity: "Rare",
      category: "TowerAugment",
      statsByType: [
        {
          stat: { ref: "Map has # additional random Modifier" },
          sources: [{ contributes: { value: 1 } }],
        },
      ],
    } as unknown as ParsedItem;
    const wrapper = await render(tablet);
    const headline = wrapper.find("[data-tablet-headline]");
    expect(headline.text()).toBe(
      "Always money: Random map mods · Random map mods: ~2.3 div (asks, 2026-11-24)",
    );
    expect(headline.attributes("title")).toContain("8,210 listed");
    expect(wrapper.find("[data-tablet-floor]").text()).toBe(
      "Cheapest asks in ex/div/chaos, 10 uses, 2026-11-24: 0.03 div; poe.ninja had 0.092 on 2026-11-22 (3.1× higher)",
    );
    vi.useRealTimers();
  });
});
