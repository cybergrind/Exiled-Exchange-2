// The researched roll profiles (WP-62/65, data/poe-source/unique-rolls.json),
// loaded once. The shipped file is validated by specs/web/unique-rolls.test.ts.
import { shallowRef } from "vue";
import { createGlobalState } from "@vueuse/core";
import type { RollProfileFile } from "./market/rollProfileSchema.ts";

export const useUniqueRolls = createGlobalState(() => {
  const file = shallowRef<RollProfileFile | undefined>(undefined);
  let loading: Promise<void> | undefined;

  function load(): Promise<void> {
    loading ??= fetch(
      `${import.meta.env.BASE_URL}data/poe-source/unique-rolls.json`,
    )
      .then((response) => response.json() as Promise<RollProfileFile>)
      .then((data) => {
        file.value = data;
      })
      .catch(() => {
        // No profiles: mods show roll grades only.
        loading = undefined;
      });
    return loading;
  }

  return { file, load };
});
