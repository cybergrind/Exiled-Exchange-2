<template>
  <template v-if="priceData">
    <div class="flex items-center pb-4" style="min-height: 3rem">
      <div
        v-if="!isValuableBasetype && !slowdown.isReady.value"
        class="flex flex-1 justify-center"
      >
        <div><i class="fas fa-dna fa-spin text-gray-600"></i></div>
        <i18n-t keypath="trade_result.getting_price" class="pl-2">
          <span class="text-gray-600">{{ t(":getting_price_from") }}</span>
        </i18n-t>
      </div>
      <template v-else>
        <div
          v-if="priceData.volume && volumeSetting !== 'none'"
          @click="openNinja"
          class="flex flex-col items-center gap-y-1 rounded hover:bg-gray-700 px-1 cursor-pointer"
        >
          <!-- Currency per hour -->
          <div
            v-if="volumeSetting === 'value' || volumeSetting === 'both'"
            class="flex flex-row items-center"
          >
            {{ priceData.volume.primaryVolumePerHour }}
            <div class="w-6 h-6 flex items-center justify-center shrink-0">
              <core-currency-img :currency="priceData.volume.currency" />
            </div>
            <div class="text-xs text-gray-500">/hr</div>
          </div>
          <!-- Items per hour -->
          <div
            v-if="volumeSetting === 'item' || volumeSetting === 'both'"
            class="flex flex-row items-center"
          >
            {{ priceData.volume.itemsPerHour }}
            <div class="w-6 h-6 flex items-center justify-center shrink-0">
              <ui-item-img :icon="item.info.icon" overflow-hidden />
            </div>
            <div class="text-xs text-gray-500">/hr</div>
          </div>
        </div>
        <item-quick-price
          class="flex-1 text-base justify-center"
          :class="{ 'opacity-50': priceData.confidence?.dim }"
          :price="priceData.price"
          :fraction="filters.stackSize != null"
          :item-img="item.info.icon"
          :item-base="item.info"
        >
          <template #item v-if="isValuableBasetype">
            <span class="text-gray-400">{{ t(":base_item") }}</span>
          </template>
        </item-quick-price>
        <div
          v-if="priceData.change || priceData.volume"
          class="flex flex-col items-center"
        >
          <div
            v-if="priceData.change"
            @click="openTrend"
            data-trend
            :class="$style['trend-btn']"
            :title="hasHistory ? 'Price history' : 'Open poe.ninja'"
          >
            <div class="text-center">
              <div class="leading-tight">
                <i
                  v-if="priceData.change.forecast === 'down'"
                  class="fas fa-angle-double-down pr-1 text-red-600"
                ></i>
                <i
                  v-if="priceData.change.forecast === 'up'"
                  class="fas fa-angle-double-up pr-1 text-green-500"
                ></i>
                <span
                  v-if="priceData.change.forecast === 'const'"
                  class="pr-1 text-gray-600 font-sans leading-none"
                  >±</span
                >
                <span>{{ priceData.change.text }}</span>
              </div>
              <div class="text-xs text-gray-500 leading-none">
                {{ t(":graph_7d") }}
              </div>
            </div>
            <div v-if="priceData.change" class="w-12 h-8">
              <vue-apexcharts
                type="area"
                :options="{
                  chart: {
                    sparkline: { enabled: true },
                    animations: { enabled: false },
                  },
                  stroke: {
                    curve: 'smooth',
                    width: 1,
                    colors: ['#a0aec0' /* gray.500 */],
                  },
                  fill: { colors: ['#4a5568' /* gray.700 */], type: 'solid' },
                  tooltip: { enabled: false },
                  plotOptions: { area: { fillTo: 'end' } },
                  yaxis: {
                    show: false,
                    min: priceData.change.graph.drawMin,
                    max: priceData.change.graph.drawMax,
                  },
                }"
                :series="[
                  {
                    data: priceData.change.graph.points,
                  },
                ]"
              />
            </div>
          </div>
          <div v-if="priceData.volume" class="flex flex-row items-center">
            <div class="text-xs text-gray-500">{{ t(":highest_volume") }}</div>

            <div class="w-6 h-6 flex items-center justify-center shrink-0">
              <core-currency-img
                :currency="priceData.volume.highestVolumeCurrency"
              />
            </div>
          </div>
        </div>
      </template>
    </div>
    <div
      v-if="priceData.confidence"
      data-confidence
      class="-mt-3 mb-3 text-center text-sm"
      :class="priceData.confidence.dim ? 'text-yellow-500' : 'text-gray-500'"
    >
      {{ priceData.confidence.text }}
    </div>
    <div
      v-if="priceData.tablet"
      data-tablet-summary
      :data-level="priceData.tablet.level"
      class="-mt-2 mb-3 text-center"
    >
      <div
        data-tablet-headline
        class="text-base font-semibold"
        :class="TABLET_LEVEL_CLASS[priceData.tablet.level]"
      >
        {{ priceData.tablet.headline }}
      </div>
      <div data-tablet-note class="text-sm text-gray-500">
        {{ priceData.tablet.detail }}
      </div>
    </div>
    <pair-rates
      v-if="priceData.exchange"
      class="-mt-2 mb-3"
      :pairs="priceData.exchange.pairs"
      :selected="priceData.exchange.selected"
      :as-of-hour="priceData.exchange.asOfHour"
      :ninja-text="priceData.exchange.ninjaText"
    />
    <button
      v-if="hasHistory && !priceData.change && !showHistory"
      data-history-toggle
      class="-mt-2 mb-3 w-full rounded text-sm text-gray-500 hover:bg-gray-700 hover:text-gray-300"
      @click="showHistory = true"
    >
      <i class="fas fa-chart-area pr-1"></i>Price history
    </button>
    <price-history
      v-if="showHistory && hasHistory && pairId"
      class="-mt-2 mb-3"
      :points="history.points.value"
      :pair-id="pairId"
      :quote="historyQuote"
      :ninja="Boolean(priceData.url)"
      @ninja="openNinja"
    />
  </template>
  <div
    v-else-if="!item.info.craftable"
    class="flex items-center pb-4"
    style="min-height: 3rem"
  >
    <item-quick-price
      class="flex-1 text-base justify-center"
      currency-text
      :item-img="item.info.icon"
      :item-base="item.info"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed, shallowRef, watch } from "vue";
import { useI18nNs } from "@/web/i18n";
import {
  CurrencyValue,
  displayRounding,
  usePoeninja,
} from "@/web/background/Prices";
import { isValuableBasetype, getDetailsId } from "./getDetailsId";
import { trendFromSparkline } from "./trend";
import { headlinePrice } from "./headlinePrice";
import PairRates from "./PairRates.vue";
import PriceHistory from "./PriceHistory.vue";
import { historySeries } from "./historySeries";
import { useMarketHistory } from "@/web/background/marketHistory";
import { useUniqueLines } from "@/web/background/uniquesStore";
import { confidenceNote } from "./confidenceNote";
import type { ConfidenceNote } from "./confidenceNote";
import { tabletSummary } from "./tabletNote";
import type { TabletSummary } from "./tabletNote";
import type { TabletVerdictLevel } from "../tablets/tabletRating";

// Matches the tier badges on the mods (TabletModBadge.vue).
const TABLET_LEVEL_CLASS: Record<TabletVerdictLevel, string> = {
  money: "text-yellow-400",
  combo: "text-green-400",
  good: "text-green-400",
  multiplier: "text-blue-400",
  niche: "text-gray-300",
  none: "text-gray-400",
};
import { useMarket } from "@/web/background/marketStore";
import type { ItemPairs, QuoteCurrency } from "@/web/background/market/types";
import ItemQuickPrice from "@/web/ui/ItemQuickPrice.vue";
import VueApexcharts from "vue3-apexcharts";
import { ItemCategory, ParsedItem } from "@/parser";
import { artificialSlowdown } from "../trade/artificial-slowdown";
import { ItemFilters } from "../filters/interfaces";
import { AppConfig } from "@/web/Config";
import { PriceCheckWidget } from "@/web/overlay/interfaces";
import UiItemImg from "@/web/ui/UiItemImg.vue";
import CoreCurrencyImg from "@/web/ui/CoreCurrencyImg.vue";

const slowdown = artificialSlowdown(800);

export default defineComponent({
  components: {
    ItemQuickPrice,
    VueApexcharts,
    UiItemImg,
    CoreCurrencyImg,
    PairRates,
    PriceHistory,
  },
  props: {
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
  },
  setup(props) {
    const { t } = useI18nNs("trade_result");
    const { findPriceByQuery, autoCurrency, xchgRateCurrency } = usePoeninja();
    const market = useMarket();
    const uniqueLines = useUniqueLines();
    const history = useMarketHistory();
    const showHistory = shallowRef(false);

    const volumeSetting = computed(
      () => AppConfig<PriceCheckWidget>("price-check")!.currencyVolume,
    );

    watch(
      () => props.item,
      (item) => {
        slowdown.reset(item);
        showHistory.value = false;
      },
      { immediate: true },
    );

    const priceData = computed(() => {
      const detailsId = getDetailsId(props.item);
      const entry = detailsId && findPriceByQuery(detailsId);
      if (!detailsId) return;
      const core = xchgRateCurrency.value?.id === "chaos" ? "chaos" : "exalted";
      const exchangeValue = market.valueFor(
        detailsId.ns,
        detailsId.name,
        core,
        entry || undefined,
      );
      if (!entry && exchangeValue?.source !== "ggg") return;
      const isDivine = props.item.info.refName === "Divine Orb";
      const ninjaPrice = () =>
        autoCurrency(entry ? entry.primaryValue : 0, isDivine);
      const headline = headlinePrice(exchangeValue, ninjaPrice);
      const pairs = market.pairsFor(detailsId.ns, detailsId.name);

      const data: {
        price: CurrencyValue;
        change?: {
          graph: { points: number[]; drawMin: number; drawMax: number };
          forecast: string;
          text: string;
        } | null;
        url?: string;
        volume?: {
          currency: string;
          primaryVolumePerHour: string;
          itemsPerHour: string;
          highestVolumeCurrency: string;
        };
        exchange?: {
          pairs: ItemPairs;
          selected?: QuoteCurrency;
          asOfHour?: number;
          ninjaText?: string;
        };
        confidence?: ConfidenceNote;
        tablet?: TabletSummary;
      } = {
        price: headline.price,
        change: entry?.sparkline.data
          ? trendFromSparkline(entry.sparkline)
          : undefined,
        url: entry ? entry.url : undefined,
      };

      if (pairs && headline.source === "ggg") {
        data.exchange = {
          pairs,
          selected: headline.selected,
          asOfHour: market.asOfHour.value,
          ninjaText: entry ? ninjaReference(entry, isDivine) : undefined,
        };
      }

      if (detailsId.ns === "UNIQUE" && detailsId.variant) {
        const line = uniqueLines.lineFor(detailsId.name, detailsId.variant);
        if (line) data.confidence = confidenceNote(line.listingCount);
      }

      if (
        props.item.category === ItemCategory.Tablet &&
        detailsId.ns === "ITEM"
      ) {
        const line = uniqueLines.tabletLineFor(
          detailsId.name,
          detailsId.variant,
        );
        if (line) data.confidence = confidenceNote(line.listingCount);
        const normal = findPriceByQuery({
          ns: "ITEM",
          name: detailsId.name,
          variant: "Normal",
        });
        data.tablet = tabletSummary(
          detailsId.name,
          detailsId.variant,
          props.item.statsByType.map((calc) => ({
            statRef: calc.stat.ref,
            value: calc.sources.reduce(
              (sum, source) => sum + (source.contributes?.value ?? 0),
              0,
            ),
          })),
          normal ? formatPrice(autoCurrency(normal.primaryValue)) : undefined,
        );
      }

      if (!entry) return data;

      if ("volumePrimaryValue" in entry) {
        const perHour = autoCurrency(entry.volumePrimaryValue);
        // Volume is poe.ninja's, so it is divided by poe.ninja's price.
        const price = ninjaPrice();

        const itemsPerHour =
          perHour!.min /
          (perHour!.currency === "div" ? entry.primaryValue : price.min);

        data.volume = {
          currency: perHour!.currency,
          primaryVolumePerHour: displayRounding(perHour!.min),
          itemsPerHour: displayRounding(itemsPerHour!, false, true),
          highestVolumeCurrency: entry.maxVolumeCurrency,
        };
      }

      return data;
    });

    const coreQuote = computed(() =>
      xchgRateCurrency.value?.id === "chaos" ? "chaos" : "exalted",
    );

    const pairId = computed(() => {
      const detailsId = getDetailsId(props.item);
      return detailsId
        ? market.pairIdFor(detailsId.ns, detailsId.name)
        : undefined;
    });

    watch(
      () => [pairId.value, market.league.value] as const,
      ([id, league]) => {
        if (id && league) history.ensure(league);
      },
      { immediate: true },
    );

    const historyQuote = computed<QuoteCurrency>(
      () => priceData.value?.exchange?.selected ?? coreQuote.value,
    );

    const hasHistory = computed(() => {
      const id = pairId.value;
      if (!id || history.league.value !== market.league.value) return false;
      const now = Date.now();
      return (["exalted", "chaos", "divine"] as const).some(
        (q) => historySeries(history.points.value, id, q, "all", now) != null,
      );
    });

    function openNinja() {
      const url = priceData.value?.url;
      if (url) window.open(url);
    }

    function formatPrice(value: CurrencyValue): string {
      const unit = value.currency === "exalted" ? "ex" : value.currency;
      return `${displayRounding(value.min, true)} ${unit}`;
    }

    function ninjaReference(
      entry: { primaryValue: number; maxVolumeCurrency?: string },
      isDivine: boolean,
    ) {
      const value = autoCurrency(entry.primaryValue, isDivine);
      const unit = value.currency === "exalted" ? "ex" : value.currency;
      const pair = entry.maxVolumeCurrency
        ? `, from the ${entry.maxVolumeCurrency} pair`
        : "";
      return `${displayRounding(value.min, true)} ${unit}${pair}`;
    }

    return {
      t,
      priceData,
      openNinja,
      openTrend() {
        if (hasHistory.value) showHistory.value = !showHistory.value;
        else openNinja();
      },
      history,
      showHistory,
      hasHistory,
      pairId,
      historyQuote,
      isValuableBasetype: computed(() => {
        return isValuableBasetype(props.item);
      }),
      slowdown,
      volumeSetting,
      TABLET_LEVEL_CLASS,
    };
  },
});
</script>

<style lang="postcss" module>
.trend-btn {
  display: flex;
  align-items: center;
  @apply gap-x-2;
  cursor: pointer;
  @apply rounded;
  @apply -my-0.5 py-0.5;
  @apply px-1;

  &:hover {
    @apply bg-gray-700;
  }
}
</style>
