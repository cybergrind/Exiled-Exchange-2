<template>
  <div
    v-if="ladder && ladder.rows.length"
    class="rounded bg-gray-900 px-3 py-2 text-sm tabular-nums"
  >
    <div class="flex items-center gap-x-3 pb-1">
      <template v-if="hasDrop">
        <button
          v-for="t in TABS"
          :key="t.id"
          :data-tab="t.id"
          class="text-xs uppercase tracking-wide border-b"
          :class="
            tab === t.id
              ? 'text-gray-200 border-gray-400'
              : 'text-gray-500 border-transparent'
          "
          @click="setTab(t.id)"
        >
          {{ t.label }}
        </button>
      </template>
      <span
        v-if="tab === 'category'"
        data-rank
        class="flex-1 text-right text-gray-500"
        >{{ rankText }}</span
      >
    </div>

    <template v-if="tab === 'category'">
      <div
        ref="list"
        class="relative"
        :class="{ 'max-h-80 overflow-y-auto': expanded }"
      >
        <template v-for="entry in entries" :key="entry.key">
          <div
            v-if="entry.divider"
            data-divider
            class="flex items-center gap-x-2 text-xs text-gray-500 py-0.5"
          >
            <span class="flex-1 border-t border-gray-700"></span
            >{{ entry.divider.label
            }}<span class="flex-1 border-t border-gray-700"></span>
          </div>
          <div
            v-else-if="entry.row"
            data-row
            :data-checked="entry.row.checked || undefined"
            class="flex items-center gap-x-1.5 rounded px-1 py-0.5 min-h-7"
            :class="
              entry.row.checked ? 'bg-gray-700 text-gray-200' : 'text-gray-400'
            "
          >
            <span class="w-5 shrink-0 text-right text-xs text-gray-600">{{
              entry.row.rank
            }}</span>
            <span class="w-5 h-5 shrink-0 flex items-center justify-center">
              <ui-item-img v-if="entry.row.icon" :icon="entry.row.icon" />
            </span>
            <span
              data-name
              class="flex-1 min-w-0 leading-tight break-words"
              :title="entry.row.name"
              >{{ entry.row.label }}</span
            >
            <span
              v-if="entry.row.noValue"
              data-no-value
              class="text-xs text-gray-500"
              >no price</span
            >
            <span class="w-8 h-1.5 shrink-0 rounded-sm bg-gray-800">
              <span
                v-if="!entry.row.noValue"
                data-bar
                class="block h-full rounded-sm"
                :class="entry.row.checked ? 'bg-gray-300' : 'bg-gray-600'"
                :style="{ width: barWidth(entry.row.bar) }"
              ></span>
            </span>
            <span
              data-value
              :data-thin="entry.row.thin || undefined"
              class="w-16 shrink-0 flex items-center justify-end gap-x-0.5"
              :class="{
                'font-semibold': entry.row.checked,
                'text-yellow-500': entry.row.thin,
              }"
              :title="
                entry.row.thin
                  ? 'Thin: few trades on this pair in the last 6 hours'
                  : undefined
              "
            >
              <span
                v-if="entry.row.estimate"
                data-estimate
                class="text-gray-500"
                title="poe.ninja estimate: no liquid Currency Exchange pair"
                >≈</span
              >
              <template v-if="entry.row.value"
                >{{ formatRate(entry.row.value.value)
                }}<img
                  :src="CURRENCY_ICONS[entry.row.value.currency]"
                  class="w-4 h-4"
                  alt=""
              /></template>
              <template v-else>?</template>
            </span>
            <span
              data-change
              class="w-10 shrink-0 text-right text-xs"
              :class="changeClass(entry.row.change)"
              >{{ changeText(entry.row.change) }}</span
            >
          </div>
        </template>
      </div>
      <button
        v-if="canExpand"
        data-expand
        class="w-full pt-1 text-xs text-gray-500 hover:text-gray-300"
        @click="toggleExpand"
      >
        {{ expanded ? "Show less" : `Show all ${ladder.total}` }}
      </button>
    </template>

    <slot v-else name="drop" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useSlots, watch } from "vue";
import type { QuoteCurrency } from "@/web/background/market/types.ts";
import { formatRate } from "@/web/background/market/format.ts";
import UiItemImg from "@/web/ui/UiItemImg.vue";
import type { Ladder, LadderDivider, LadderRow } from "./ladder.ts";

type Tab = "category" | "drop";

const props = defineProps<{
  /** buildLadder() result; null or no rows renders nothing. */
  ladder: Ladder | null;
  /** Category name for the rank line, e.g. "Omens" (LADDER_CATEGORIES). */
  category?: string;
}>();

const emit = defineEmits<{
  (e: "expand", expanded: boolean): void;
  (e: "tab", tab: Tab): void;
}>();

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "category", label: "Category" },
  { id: "drop", label: "Drop group" },
];

const CURRENCY_ICONS: Record<QuoteCurrency, string> = {
  exalted: "/images/exa.png",
  chaos: "/images/chaos.png",
  divine: "/images/divine.png",
};

// Slot `drop`: drop group content, e.g. the existing RelatedItems. Its
// presence adds the Category | Drop group tabs.
const slots = useSlots();
const hasDrop = computed(() => slots.drop != null);

const tab = ref<Tab>("category");
const expanded = ref(false);
const list = ref<HTMLElement>();

const rankText = computed(() => {
  const ladder = props.ladder!;
  const what = props.category ? ` ${props.category}` : "";
  return ladder.rank === null
    ? `${ladder.total}${what}`
    : `${ladder.rank} of ${ladder.total}${what}`;
});

const canExpand = computed(() => {
  const { window, total } = props.ladder!;
  return window.end - window.start < total;
});

type Entry =
  | { key: string; row: LadderRow; divider?: undefined }
  | { key: string; divider: LadderDivider; row?: undefined };

const entries = computed<Entry[]>(() => {
  const ladder = props.ladder;
  if (!ladder) return [];
  const { start, end } = expanded.value
    ? { start: 0, end: ladder.rows.length }
    : ladder.window;
  const out: Entry[] = [];
  for (let i = start; i <= end; i++) {
    for (const divider of ladder.dividers) {
      if (divider.index === i) out.push({ key: divider.label, divider });
    }
    if (i < end) {
      const row = ladder.rows[i];
      out.push({ key: `${row.ns}::${row.name}`, row });
    }
  }
  return out;
});

function barWidth(bar: number): string {
  // A sliver for the cheapest item, so every priced row shows a bar.
  return `${Number(Math.max(2, bar * 100).toFixed(1))}%`;
}

function changeText(change: number | null): string {
  if (change === null) return "";
  const rounded = Math.round(change);
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function changeClass(change: number | null): string {
  if (change === null || Math.round(change) === 0) return "text-gray-500";
  return change > 0 ? "text-green-500" : "text-red-500";
}

function setTab(next: Tab) {
  if (tab.value === next) return;
  tab.value = next;
  emit("tab", next);
}

/** Scrolls the open list so the priced item sits in the middle. */
async function centreChecked() {
  if (!expanded.value) return;
  await nextTick();
  const el = list.value;
  const row = el?.querySelector<HTMLElement>("[data-checked]");
  // The list is `relative`, so offsetTop is measured from its top.
  if (el && row) {
    el.scrollTop = row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2;
  }
}

async function toggleExpand() {
  expanded.value = !expanded.value;
  emit("expand", expanded.value);
  await centreChecked();
}

// The panel is reused for the next price check: an open list would keep the
// previous item's scroll position, so follow the newly priced item.
watch(
  () => {
    const ladder = props.ladder;
    const row = ladder?.rows.find((r) => r.checked);
    return row ? `${row.ns}::${row.name}:${ladder!.total}` : "";
  },
  () => centreChecked(),
  { flush: "post" },
);
</script>
