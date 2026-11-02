<template>
  <div class="bg-gray-900 px-4 py-3 text-base">
    <div class="flex items-baseline gap-x-2 pb-2">
      <span class="text-sm uppercase tracking-wide text-gray-500"
        >Rune versions</span
      >
      <span class="flex-1 truncate text-gray-300">{{ name }}</span>
      <i
        data-explain
        class="fas fa-info-circle text-gray-500 text-lg"
        :title="EXPLANATION"
      ></i>
    </div>
    <div
      v-for="row in rows"
      :key="row.baseType"
      :data-variant="row.kind"
      :data-current="row.current ? '' : undefined"
      class="flex items-center gap-x-3 rounded px-2 py-2"
      :class="row.current ? 'bg-gray-700 text-gray-100' : 'text-gray-300'"
    >
      <img :src="row.icon" class="w-10 h-10 object-contain" alt="" />
      <div class="flex-1 min-w-0 leading-snug">
        <div class="text-lg">{{ row.label }}</div>
        <div class="text-sm text-gray-400 break-words">{{ row.baseType }}</div>
      </div>
      <div class="text-right leading-snug">
        <div
          data-price
          class="text-lg font-semibold"
          :class="{ 'opacity-50': row.low }"
        >
          {{ row.price }}
        </div>
        <div v-if="row.multiple" data-multiple class="text-sm text-gray-200">
          {{ row.multiple }}
        </div>
        <div
          class="text-sm"
          :class="row.low ? 'text-yellow-500' : 'text-gray-400'"
        >
          {{ row.listings }}
        </div>
      </div>
    </div>
    <div v-if="caveat" data-caveat class="pt-2 text-sm text-gray-400">
      {{ caveat }}
    </div>
  </div>
</template>

<script setup lang="ts">
// WP-52: a unique's regular, Runeforged and Runemastered versions with their
// prices. Wording follows research/uniques/_mechanics.md: "the regular
// version", never "the base"; no reason given for a premium.
import { computed } from "vue";
import type { UniqueVariant } from "@/web/background/market/uniques.ts";

const props = defineProps<{
  name: string;
  variants: UniqueVariant[];
  /** The checked item's base type. */
  current: string;
  /** A divine value as text, in the app's display currency. */
  formatPrice: (div: number) => string;
}>();

const EXPLANATION =
  "A Runemastered or Runeforged unique is the same unique moved to a different base type at the Verisium Anvil: it gains Runic Ward and its base defences or damage and requirements change, while its unique modifiers stay the same. Some Kalguuran uniques also gain a new modifier.";
const CAVEAT =
  "Rune versions can be worth less than the regular one; prices can mix several recipe results.";

function formatMultiple(m: number): string {
  const n = m >= 10 ? Math.round(m) : Number(m.toPrecision(2));
  return `×${n} the regular version`;
}

const rows = computed(() =>
  props.variants.map((v) => ({
    kind: v.line.kind,
    label: v.line.kind === "regular" ? "Regular" : v.line.kind,
    baseType: v.line.baseType,
    icon: v.line.icon,
    current: v.line.baseType === props.current,
    price: props.formatPrice(v.line.primaryValue),
    low: v.confidence === "low",
    listings: `${v.line.listingCount} listing${v.line.listingCount === 1 ? "" : "s"}`,
    multiple:
      v.line.kind !== "regular" && v.multiple != null
        ? formatMultiple(v.multiple)
        : undefined,
  })),
);

const caveat = computed(() =>
  props.variants.some((v) => v.multiple != null && v.multiple < 1)
    ? CAVEAT
    : undefined,
);
</script>
