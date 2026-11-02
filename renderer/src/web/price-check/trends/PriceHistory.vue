<template>
  <div class="rounded bg-gray-900 px-3 py-2">
    <div class="flex items-center gap-x-1 text-sm pb-1 whitespace-nowrap">
      <span class="text-xs uppercase tracking-wide text-gray-500 pr-2"
        >History</span
      >
      <button
        v-for="q in quotes"
        :key="q"
        :data-quote="q"
        :class="[
          $style.tab,
          { [$style.active]: q === shownQuote, active: q === shownQuote },
        ]"
        @click="pickedQuote = q"
      >
        <img :src="CURRENCIES[q].icon" class="w-4 h-4" alt="" />{{
          CURRENCIES[q].label
        }}
      </button>
      <span class="flex-1"></span>
      <button
        v-for="r in RANGES"
        :key="r.id"
        :data-range="r.id"
        :disabled="!ranges.includes(r.id)"
        :title="ranges.includes(r.id) ? undefined : 'No older history yet'"
        :class="[
          $style.tab,
          { [$style.active]: r.id === shownRange, active: r.id === shownRange },
        ]"
        @click="pickedRange = r.id"
      >
        {{ r.label }}
      </button>
    </div>
    <template v-if="series">
      <vue-apexcharts
        type="rangeArea"
        height="150"
        :options="priceOptions"
        :series="priceSeries"
      />
      <vue-apexcharts
        type="bar"
        height="80"
        :options="volumeOptions"
        :series="volumeSeries"
      />
    </template>
    <div v-else class="py-6 text-center text-gray-500">
      Not enough history yet
    </div>
    <div class="flex gap-x-3 text-sm text-gray-500">
      <span class="flex-1">{{ summary }}</span>
      <button
        v-if="ninja"
        data-ninja
        class="hover:text-gray-300"
        @click="$emit('ninja')"
      >
        poe.ninja <i class="fas fa-external-link-alt text-xs"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from "vue";
import VueApexcharts from "vue3-apexcharts";
import type { HistoryPoint } from "@/web/background/market/history.ts";
import type { QuoteCurrency } from "@/web/background/market/types.ts";
import {
  formatCount,
  formatRange,
  formatRate,
} from "@/web/background/market/format.ts";
import { historySeries } from "./historySeries.ts";
import type { HistoryRange, SeriesPoint } from "./historySeries.ts";

const props = defineProps<{
  points: readonly HistoryPoint[];
  /** The item's GGG id. */
  pairId: string;
  /** The pair shown first: the one the headline price comes from. */
  quote: QuoteCurrency;
  /** Shows a link that emits `ninja`. */
  ninja?: boolean;
  nowMs?: number;
}>();

defineEmits<{ (e: "ninja"): void }>();

const CURRENCIES: Record<QuoteCurrency, { label: string; icon: string }> = {
  exalted: { label: "Exalted", icon: "/images/exa.png" },
  chaos: { label: "Chaos", icon: "/images/chaos.png" },
  divine: { label: "Divine", icon: "/images/divine.png" },
};
const RANGES: Array<{ id: HistoryRange; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "all", label: "All" },
];

// Tailwind grays: one series per chart, so one ink; the grid stays recessive.
const INK = "#cbd5e0"; // gray.400
const BAND = "#4a5568"; // gray.700
const GRID = "#2d3748"; // gray.800
const MUTED = "#718096"; // gray.600

const pickedQuote = shallowRef<QuoteCurrency | undefined>();
const pickedRange = shallowRef<HistoryRange | undefined>();

function seriesFor(
  quote: QuoteCurrency,
  range: HistoryRange,
): SeriesPoint[] | null {
  return historySeries(
    props.points,
    props.pairId,
    quote,
    range,
    props.nowMs ?? Date.now(),
  );
}

const quotes = computed(() =>
  (["exalted", "chaos", "divine"] as const).filter((q) => seriesFor(q, "all")),
);

const shownQuote = computed<QuoteCurrency>(() => {
  const want = pickedQuote.value ?? props.quote;
  return quotes.value.includes(want) ? want : (quotes.value[0] ?? props.quote);
});

// A range is offered when it has points and shows more than the shorter one;
// with only a day recorded, 7 d and all would repeat 24 h.
const ranges = computed<HistoryRange[]>(() => {
  const out: HistoryRange[] = [];
  let shown = 0;
  for (const { id } of RANGES) {
    const count = seriesFor(shownQuote.value, id)?.length ?? 0;
    if (count > shown) {
      out.push(id);
      shown = count;
    }
  }
  return out;
});

// 7 d first, as the poe.ninja sparkline; else the longest range offered.
const shownRange = computed<HistoryRange>(() => {
  const offered = ranges.value;
  if (pickedRange.value && offered.includes(pickedRange.value)) {
    return pickedRange.value;
  }
  return offered.includes("7d") ? "7d" : (offered.at(-1) ?? "24h");
});

const series = computed(() => seriesFor(shownQuote.value, shownRange.value));

const priceSeries = computed(() => [
  {
    name: "Range",
    type: "rangeArea",
    data: (series.value ?? []).map((p) => ({ x: p.t, y: [p.low, p.high] })),
  },
  {
    name: "Typical",
    type: "line",
    data: (series.value ?? []).map((p) => ({ x: p.t, y: p.typical })),
  },
]);

const volumeSeries = computed(() => [
  {
    name: "Traded",
    data: (series.value ?? []).map((p) => ({ x: p.t, y: p.traded })),
  },
]);

// The band fills the chart: an axis from zero would squash it to a strip.
const priceBounds = computed(() => {
  const s = series.value ?? [];
  const low = Math.min(...s.map((p) => p.low));
  const high = Math.max(...s.map((p) => p.high));
  const pad = (high - low) * 0.05 || high * 0.05;
  return { min: Math.max(low - pad, low / 2), max: high + pad };
});

const maxTraded = computed(() =>
  Math.max(0, ...(series.value ?? []).map((p) => p.traded)),
);

const unit = computed(() => CURRENCIES[shownQuote.value].label.toLowerCase());

const common = {
  chart: {
    background: "transparent",
    toolbar: { show: false },
    zoom: { enabled: false },
    animations: { enabled: false },
    fontFamily: "inherit",
    foreColor: MUTED,
  },
  legend: { show: false },
  dataLabels: { enabled: false },
  grid: {
    borderColor: GRID,
    strokeDashArray: 0,
    padding: { left: 4, right: 4, top: -8, bottom: 0 },
  },
};

const TIME = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
});

// One box for both charts, so hovering either tells the whole period.
function tooltipHtml({ dataPointIndex }: { dataPointIndex: number }): string {
  const p = series.value?.[dataPointIndex];
  if (!p) return "";
  const when = (p.period === "day" ? DATE : TIME).format(p.t);
  const row = (label: string, value: string) =>
    `<div class="flex gap-x-3"><span class="flex-1 text-gray-500">${label}</span><span>${value}</span></div>`;
  return (
    `<div class="px-2 py-1 text-sm tabular-nums bg-gray-800 text-gray-200">` +
    `<div class="text-gray-400 pb-0.5">${when}</div>` +
    row("Rate", `${formatRate(p.typical)} ${unit.value}`) +
    row("Range", formatRange(p.low, p.high)) +
    row("Traded", formatCount(p.traded)) +
    `</div>`
  );
}

const tooltip = {
  theme: "dark",
  shared: true,
  intersect: false,
  custom: tooltipHtml,
};

const priceOptions = computed(() => ({
  ...common,
  chart: { ...common.chart, id: "price-history" },
  colors: [BAND, INK],
  fill: { opacity: [0.6, 1] },
  stroke: { curve: "straight", width: [0, 2] },
  markers: { size: 0, hover: { size: 4 } },
  xaxis: {
    type: "datetime",
    labels: { show: false, datetimeUTC: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  },
  yaxis: {
    ...priceBounds.value,
    tickAmount: 3,
    labels: { formatter: (v: number) => formatRate(v), minWidth: 40 },
  },
  tooltip,
}));

const volumeOptions = computed(() => ({
  ...common,
  chart: { ...common.chart, id: "volume-history" },
  colors: [MUTED],
  plotOptions: { bar: { columnWidth: "70%", borderRadius: 1 } },
  xaxis: {
    type: "datetime",
    labels: { datetimeUTC: false, style: { fontSize: "11px" } },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  },
  yaxis: {
    min: 0,
    max: maxTraded.value,
    tickAmount: 1,
    labels: {
      // Only the top label: "0" under it collides at this height.
      formatter: (v: number) => (v > 0 ? formatCount(v) : ""),
      minWidth: 40,
    },
  },
  tooltip,
}));

const summary = computed(() => {
  const s = series.value;
  if (!s) return "";
  const first = s[0].typical;
  const last = s[s.length - 1].typical;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  const traded = s.reduce((n, p) => n + p.traded, 0);
  return `${sign}${Math.abs(change).toFixed(0)}% · ${formatCount(traded)} traded`;
});
</script>

<style lang="postcss" module>
.tab {
  display: flex;
  align-items: center;
  @apply gap-x-1 rounded px-1.5 text-gray-500;

  &:hover:not(:disabled) {
    @apply bg-gray-700 text-gray-300;
  }

  &:disabled {
    @apply opacity-40 cursor-default;
  }
}

.active {
  @apply bg-gray-800 text-gray-200;
}
</style>
