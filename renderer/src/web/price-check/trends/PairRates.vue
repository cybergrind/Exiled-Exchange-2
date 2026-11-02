<template>
  <div class="rounded bg-gray-900 px-3 py-2">
    <table class="w-full text-sm tabular-nums">
      <thead>
        <tr class="text-xs uppercase tracking-wide text-gray-500">
          <th class="text-left font-normal pb-1">Currency Exchange</th>
          <th class="text-right font-normal pb-1">Rate</th>
          <th class="text-left font-normal pb-1 pl-4">Range, 6 h</th>
          <th class="text-right font-normal pb-1">Traded</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.currency"
          :data-pair="row.currency"
          :class="row.currency === selected ? 'text-gray-200' : 'text-gray-400'"
        >
          <td class="py-0.5">
            <span class="flex items-center gap-x-1.5">
              <img :src="row.icon" class="w-5 h-5" alt="" />{{ row.label }}
            </span>
          </td>
          <td
            class="text-right text-base"
            :class="{ 'font-semibold': row.currency === selected }"
          >
            {{ row.typical }}
          </td>
          <td class="pl-4 text-gray-400">{{ row.range }}</td>
          <td class="text-right text-gray-500">
            <span v-if="row.thin" class="text-yellow-500 pr-1">thin</span
            >{{ row.traded }}
          </td>
        </tr>
      </tbody>
    </table>
    <div class="flex gap-x-3 pt-1.5 text-sm text-gray-500">
      <span class="flex-1" v-if="ninjaText" data-ninja
        >poe.ninja: {{ ninjaText }}</span
      >
      <span v-else class="flex-1"></span>
      <span v-if="asOfHour != null" data-age>{{ age }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type {
  ItemPairs,
  QuoteCurrency,
} from "@/web/background/market/types.ts";
import { THIN_TRADED } from "@/web/background/market/constants.ts";
import {
  formatAge,
  formatCount,
  formatRange,
  formatRate,
} from "@/web/background/market/format.ts";

const props = defineProps<{
  pairs: ItemPairs;
  /** The pair the headline price comes from. */
  selected?: QuoteCurrency;
  asOfHour?: number;
  /** poe.ninja's figure, shown for reference only. */
  ninjaText?: string;
  nowMs?: number;
}>();

const CURRENCIES: Record<QuoteCurrency, { label: string; icon: string }> = {
  exalted: { label: "Exalted", icon: "/images/exa.png" },
  chaos: { label: "Chaos", icon: "/images/chaos.png" },
  divine: { label: "Divine", icon: "/images/divine.png" },
};

const rows = computed(() =>
  (["exalted", "chaos", "divine"] as const).flatMap((currency) => {
    const pair = props.pairs[currency];
    if (!pair) return [];
    return [
      {
        currency,
        ...CURRENCIES[currency],
        typical: formatRate(pair.typical),
        range: formatRange(pair.low, pair.high),
        traded: formatCount(pair.traded),
        thin: pair.traded < THIN_TRADED,
      },
    ];
  }),
);

const age = computed(() =>
  props.asOfHour == null
    ? ""
    : `updated ${formatAge(props.asOfHour, props.nowMs ?? Date.now())}`,
);
</script>
