<template>
  <span v-if="importance || grade" class="flex items-baseline gap-x-1">
    <span
      v-if="importance"
      data-unique-importance
      :data-importance="importance"
      class="rounded px-1 text-xs leading-4 font-semibold whitespace-nowrap"
      :class="IMPORTANCE_CLASS[importance]"
      :title="why"
      >{{ IMPORTANCE_LABEL[importance] }}</span
    >
    <span
      v-if="grade"
      data-roll-grade
      :data-grade="grade"
      class="rounded px-1 text-xs leading-4 font-semibold whitespace-nowrap"
      :class="GRADE_CLASS[grade]"
      :title="gradeTitle"
      >{{ ROLL_GRADE_LABEL[grade] }}</span
    >
  </span>
</template>

<script setup lang="ts">
// A unique mod's researched importance and this copy's roll grade, as text
// and colour (never colour alone).
import { computed } from "vue";
import { ROLL_GRADE_LABEL } from "./rollProfile";
import type { RollGrade } from "./rollProfile";

type ShownImportance = "key" | "good";

const props = defineProps<{
  importance?: ShownImportance;
  why?: string;
  grade?: RollGrade;
  /** Where the roll sits in its range, 0..1. */
  goodness?: number;
}>();

const IMPORTANCE_LABEL: Record<ShownImportance, string> = {
  key: "Key mod",
  good: "Valued mod",
};
const IMPORTANCE_CLASS: Record<ShownImportance, string> = {
  key: "bg-yellow-500 text-gray-900",
  good: "bg-green-700 text-gray-100",
};
const GRADE_CLASS: Record<RollGrade, string> = {
  perfect: "border border-yellow-400 text-yellow-300",
  top: "border border-green-500 text-green-300",
  good: "border border-gray-500 text-gray-300",
};

const gradeTitle = computed(() =>
  props.goodness === undefined
    ? undefined
    : `${Math.round(props.goodness * 100)}% of the way up its range`,
);
</script>
