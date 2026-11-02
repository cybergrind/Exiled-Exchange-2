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
            @click="openNinja"
            :class="$style['trend-btn']"
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
    <pair-rates
      v-if="priceData.exchange"
      class="-mt-2 mb-3"
      :pairs="priceData.exchange.pairs"
      :selected="priceData.exchange.selected"
      :as-of-hour="priceData.exchange.asOfHour"
      :ninja-text="priceData.exchange.ninjaText"
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
import { defineComponent, PropType, computed, watch } from "vue";
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
import { useMarket } from "@/web/background/marketStore";
import type { ItemPairs, QuoteCurrency } from "@/web/background/market/types";
import ItemQuickPrice from "@/web/ui/ItemQuickPrice.vue";
import VueApexcharts from "vue3-apexcharts";
import { ParsedItem } from "@/parser";
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

    const volumeSetting = computed(
      () => AppConfig<PriceCheckWidget>("price-check")!.currencyVolume,
    );

    watch(
      () => props.item,
      (item) => {
        slowdown.reset(item);
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
      openNinja() {
        const url = priceData.value?.url;
        if (url) window.open(url);
      },
      isValuableBasetype: computed(() => {
        return isValuableBasetype(props.item);
      }),
      slowdown,
      volumeSetting,
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
