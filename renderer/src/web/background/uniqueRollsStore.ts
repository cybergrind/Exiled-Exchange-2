// The researched roll profiles (WP-62/65, data/poe-source/unique-rolls.json)
// and the surveyed builds using each unique (unique-builds.json), loaded once.
// The shipped profiles are validated by specs/web/unique-rolls.test.ts.
import { shallowRef } from "vue";
import { createGlobalState } from "@vueuse/core";
import type { RollProfileFile } from "./market/rollProfileSchema.ts";
import type { UniqueBuildsFile } from "../price-check/trends/buildUsage.ts";

export const useUniqueRolls = createGlobalState(() => {
  const file = shallowRef<RollProfileFile | undefined>(undefined);
  const builds = shallowRef<UniqueBuildsFile | undefined>(undefined);
  let loading: Promise<void> | undefined;

  async function fetchJson<T>(name: string): Promise<T> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/poe-source/${name}`,
    );
    return (await response.json()) as T;
  }

  function load(): Promise<void> {
    loading ??= Promise.all([
      fetchJson<RollProfileFile>("unique-rolls.json").then((data) => {
        file.value = data;
      }),
      fetchJson<UniqueBuildsFile>("unique-builds.json").then((data) => {
        builds.value = data;
      }),
    ])
      .then(() => undefined)
      .catch(() => {
        // Missing data: mods show roll grades only; retry on next use.
        loading = undefined;
      });
    return loading;
  }

  return { file, builds, load };
});
