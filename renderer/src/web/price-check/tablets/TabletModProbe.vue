<template>
  <div v-if="plan" class="mb-2 mx-2 px-2 py-1 rounded bg-gray-700 leading-snug">
    <div class="flex items-center gap-2">
      <button class="btn" :disabled="running" @click="run">
        Value the mods
      </button>
      <span class="text-gray-400">
        <template v-if="running">
          Searching {{ step + 1 }} of {{ plan.length }}…
        </template>
        <template v-else-if="!values">
          {{ plan.length }} searches, fresh listings (1 week), online sellers
        </template>
        <template v-else-if="values.floorAll !== undefined">
          With all rated mods: {{ format(values.floorAll) }} ({{ totals[0] }}
          listed)
        </template>
        <template v-else>
          Too few fresh listings with all rated mods ({{ totals[0] }})
        </template>
      </span>
    </div>
    <div v-if="error" class="text-red-400">{{ error }}</div>
    <table v-if="values && values.mods.length" class="w-full mt-1">
      <tr class="text-gray-500 text-left">
        <th class="font-normal pr-2">Mod</th>
        <th class="font-normal pr-2">Floor without it</th>
        <th class="font-normal pr-2">Adds</th>
        <th class="font-normal">×</th>
      </tr>
      <tr v-for="(mod, i) in values.mods" :key="mod.statRef">
        <td class="pr-2">{{ mod.short }}</td>
        <td class="pr-2">
          {{
            mod.floorWithout === undefined
              ? "too few"
              : format(mod.floorWithout)
          }}
          <span class="text-gray-500">({{ totals[i + 1] }})</span>
        </td>
        <td class="pr-2 text-orange-400">
          {{ mod.adds === undefined ? "—" : format(mod.adds) }}
        </td>
        <td>
          {{
            mod.multiplier === undefined ? "—" : `${mod.multiplier.toFixed(1)}×`
          }}
        </td>
      </tr>
    </table>
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  onUnmounted,
  PropType,
  ref,
  shallowRef,
  watch,
} from "vue";
import { ItemCategory, ItemRarity, ParsedItem } from "@/parser";
import { ItemFilters, StatFilter } from "../filters/interfaces";
import { displayRounding, usePoeninja } from "@/web/background/Prices";
import { modValues, planModProbe } from "./modProbe";
import { runModProbe } from "./runModProbe";

// The "Value the mods" button (guide/tablets.html T-6b). Nothing runs until
// the user presses it; the plan is at most 5 searches.
export default defineComponent({
  props: {
    filters: { type: Object as PropType<ItemFilters>, required: true },
    stats: { type: Array as PropType<StatFilter[]>, required: true },
    item: { type: Object as PropType<ParsedItem>, required: true },
  },
  setup(props) {
    const { autoCurrency } = usePoeninja();
    const plan = computed(() => {
      const item = props.item;
      if (item.category !== ItemCategory.Tablet) return undefined;
      if (item.rarity !== ItemRarity.Magic && item.rarity !== ItemRarity.Rare) {
        return undefined;
      }
      return planModProbe(item.info.refName, props.stats);
    });
    const running = ref(false);
    const step = ref(0);
    const error = ref<string | null>(null);
    const values = shallowRef<ReturnType<typeof modValues> | null>(null);
    const totals = shallowRef<number[]>([]);
    let runId = 0;

    // A new item or changed ticks make old values wrong.
    watch(
      () => [props.item, plan.value],
      () => {
        runId++;
        running.value = false;
        values.value = null;
        error.value = null;
      },
    );
    onUnmounted(() => {
      runId++;
    });

    async function run() {
      const current = plan.value;
      if (!current || running.value) return;
      const id = ++runId;
      running.value = true;
      error.value = null;
      values.value = null;
      try {
        const outcomes = await runModProbe(
          current,
          props.filters,
          props.item,
          (i) => {
            step.value = i;
          },
          () => id !== runId,
        );
        if (id !== runId) return;
        totals.value = outcomes.map((o) => o.total);
        values.value = modValues(
          props.item.info.refName,
          current,
          outcomes.map((o) => o.floor),
        );
      } catch (err) {
        if (id === runId) error.value = (err as Error).message;
      } finally {
        if (id === runId) running.value = false;
      }
    }

    function format(div: number) {
      const value = autoCurrency(div);
      const unit = value.currency === "exalted" ? "ex" : value.currency;
      return `${displayRounding(value.min, true)} ${unit}`;
    }

    return { plan, running, step, error, values, totals, run, format };
  },
});
</script>
