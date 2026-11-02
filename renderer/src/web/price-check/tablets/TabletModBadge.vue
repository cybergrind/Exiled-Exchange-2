<template>
  <span
    data-tablet-tier
    :data-tier="rating.tier"
    class="rounded px-1 text-xs leading-4 font-semibold whitespace-nowrap"
    :class="TIER_CLASS[rating.tier]"
    :title="title"
    >{{ TIER_LABEL[rating.tier] }}</span
  >
</template>

<script setup lang="ts">
// A rated tablet mod's tier, as text and colour (never colour alone).
import { computed } from "vue";
import { TIER_LABEL } from "./tabletRating.ts";
import type { TabletModRating, TabletTier } from "./tabletRating.ts";

const props = defineProps<{
  rating: TabletModRating;
  /** Where the roll sits in its range, 0..1. */
  roll?: number;
}>();

const TIER_CLASS: Record<TabletTier, string> = {
  money: "bg-yellow-500 text-gray-900",
  good: "bg-green-700 text-gray-100",
  multiplier: "bg-blue-700 text-gray-100",
  niche: "bg-gray-600 text-gray-100",
};

const title = computed(() => {
  const range = props.rating.range
    ? ` Rolls ${props.rating.range[0]}–${props.rating.range[1]}` +
      (props.roll === undefined
        ? "."
        : `; this one is ${Math.round(props.roll * 100)}% of the way up.`)
    : "";
  return `${TIER_LABEL[props.rating.tier]}: ${props.rating.short}.${range}`;
});
</script>
