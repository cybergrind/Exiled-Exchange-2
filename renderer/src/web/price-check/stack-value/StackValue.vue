<template>
  <div
    v-if="show"
    class="p-2 border-dashed border border-gray-600 rounded mt-2"
  >
    <div class="flex text-gray-400 leading-none">
      <div class="w-1/2">
        {{ t("trade_result.you_have") }} <span class="font-sans">×</span>
        {{ value.have.amount }}
        <i class="fas fa-arrow-right text-gray-600 px-1 text-xs"></i>
        {{ value.have.price }}
      </div>
      <div class="w-1/2 pl-2" v-if="value.oneStack">
        {{ t("trade_result.stack") }} <span class="font-sans">×</span>
        {{ value.oneStack.amount }}
        <i class="fas fa-arrow-right text-gray-600 px-1 text-xs"></i>
        {{ value.oneStack.price }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType, computed } from "vue";
import { useI18n } from "vue-i18n";
import { usePoeninja, displayRounding } from "@/web/background/Prices";
import { getDetailsId } from "../trends/getDetailsId";
import { stackPrice } from "../trends/headlinePrice";
import { useMarket } from "@/web/background/marketStore";
import { ParsedItem } from "@/parser";
import { ItemFilters } from "../filters/interfaces";

export default defineComponent({
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true,
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true,
    },
  },
  setup(props) {
    const { findPriceByQuery, autoCurrency, xchgRateCurrency } = usePoeninja();
    const market = useMarket();

    function exchangeFor(id: NonNullable<ReturnType<typeof getDetailsId>>) {
      const core = xchgRateCurrency.value?.id === "chaos" ? "chaos" : "exalted";
      return market.valueFor(
        id.ns,
        id.name,
        core,
        findPriceByQuery(id) || undefined,
      );
    }

    function getPriceFor(n: number) {
      const id = getDetailsId(props.item)!;
      const one = findPriceByQuery(id);
      const price = stackPrice(n, exchangeFor(id), (count) =>
        autoCurrency(count * (one ? one.primaryValue : 0)),
      );

      return `${displayRounding(price.min)} ${price.currency}`;
    }

    const { t } = useI18n();

    return {
      t,
      show: computed(() => {
        const id = getDetailsId(props.item);
        return Boolean(
          props.filters.stackSize &&
            id &&
            (findPriceByQuery(id) || exchangeFor(id)?.source === "ggg"),
        );
      }),
      value: computed(() => {
        return {
          have: {
            amount: props.filters.stackSize!.value,
            price: getPriceFor(props.filters.stackSize!.value),
          },
          oneStack: props.item.stackSize
            ? {
                amount: props.item.stackSize.max,
                price: getPriceFor(props.item.stackSize.max),
              }
            : null,
        };
      }),
    };
  },
});
</script>
