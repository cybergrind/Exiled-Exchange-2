// App state for poe.ninja's unique lines (guide/poe-source.html, WP-50):
// listing counts for confidence (WP-51) and rune variants (WP-52). Fetched at
// most hourly through main's proxy; restored from the snapshot at start.
import { shallowRef } from "vue";
import { createGlobalState } from "@vueuse/core";
import { Host } from "./IPC";
import { fetchUniqueLines } from "./market/update.ts";
import type { HttpGet } from "./market/update.ts";
import type { SnapshotUniques } from "./market/snapshot.ts";
import {
  confidence,
  tabletLine,
  uniqueLine,
  uniqueVariants,
} from "./market/uniques.ts";
import type {
  Confidence,
  UniqueLine,
  UniqueVariant,
} from "./market/uniques.ts";

const proxyGet: HttpGet = async (url) => {
  const response = await Host.proxy(url.replace(/^https?:\/\//, ""));
  return { status: response.status, body: await response.text(), headers: {} };
};

export const useUniqueLines = createGlobalState(() => {
  const lines = shallowRef<UniqueLine[]>([]);
  const league = shallowRef<string | undefined>(undefined);
  let block: SnapshotUniques | undefined;
  let running: Promise<boolean> | undefined;

  function set(leagueId: string, next: SnapshotUniques | undefined) {
    league.value = leagueId;
    block = next;
    lines.value = next?.lines ?? [];
  }

  /** The snapshot's lines, unless newer ones of that league are shown. */
  function restore(leagueId: string, saved: SnapshotUniques) {
    if (
      league.value === leagueId &&
      block &&
      Date.parse(block.fetchedAt) >= Date.parse(saved.fetchedAt)
    ) {
      return;
    }
    set(leagueId, saved);
  }

  /** True when new lines arrived. One fetch at a time. */
  async function refresh(leagueId: string, nowMs = Date.now()) {
    await running;
    const run = (async () => {
      const previous = league.value === leagueId ? block : undefined;
      const next = await fetchUniqueLines(
        {
          league: leagueId,
          nowMs,
          http: proxyGet,
          log: (message) => console.warn(message),
        },
        previous,
      );
      if (next === previous) {
        if (league.value !== leagueId) set(leagueId, undefined);
        return false;
      }
      set(leagueId, next);
      return true;
    })();
    running = run.catch(() => false);
    return run;
  }

  function snapshotBlock(leagueId: string): SnapshotUniques | undefined {
    return league.value === leagueId ? block : undefined;
  }

  function lineFor(name: string, baseType: string): UniqueLine | undefined {
    return uniqueLine(lines.value, name, baseType);
  }

  /** A non-unique tablet's line, by base name and rarity. */
  function tabletLineFor(
    name: string,
    variant: string | undefined,
  ): UniqueLine | undefined {
    return variant ? tabletLine(lines.value, name, variant) : undefined;
  }

  function confidenceFor(
    name: string,
    baseType: string,
  ): Confidence | undefined {
    const line = lineFor(name, baseType);
    return line ? confidence(line.listingCount) : undefined;
  }

  function variantsFor(name: string): UniqueVariant[] {
    return uniqueVariants(lines.value, name);
  }

  return {
    lines,
    league,
    restore,
    refresh,
    snapshotBlock,
    lineFor,
    tabletLineFor,
    confidenceFor,
    variantsFor,
  };
});
