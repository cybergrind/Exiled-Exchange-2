// The Tablets ladder: poe.ninja prices a non-unique tablet per base and rarity
// (PrecursorTablets, "Ritual Tablet" / "Magic") and each unique tablet by name
// (UniqueTablets). Neither trades on the Currency Exchange, so the rows are
// poe.ninja values. Pure and Node-runnable like ladder.ts.

import type { LadderItem } from "./ladder.ts";

export const TABLET_CATEGORY = "Tablets";

export interface TabletOverviewLine {
  name: string;
  /** Rarity for a base tablet; the base type for a unique one. */
  variant?: string;
  primaryValue: number;
  totalChange?: number;
}

/** The ladder name of an item: "Ritual Tablet (Magic)", or a unique's name. */
export function tabletKey(query: {
  ns: string;
  name: string;
  variant?: string;
}): string {
  return query.ns === "UNIQUE" || !query.variant
    ? query.name
    : `${query.name} (${query.variant})`;
}

export function tabletLadderItems(
  bases: readonly TabletOverviewLine[],
  uniques: readonly TabletOverviewLine[],
  icon: (ns: string, name: string) => string | undefined,
): LadderItem[] {
  const item = (
    ns: string,
    line: TabletOverviewLine,
    label: string,
  ): LadderItem => ({
    name: tabletKey({ ns, name: line.name, variant: line.variant }),
    label,
    ns,
    icon: icon(ns, line.name),
    ninja: { primaryValue: line.primaryValue, totalChange: line.totalChange },
  });
  return [
    ...bases.map((line) =>
      item(
        "ITEM",
        line,
        [line.name.replace(/ Tablet$/, ""), line.variant]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    ...uniques.map((line) => item("UNIQUE", line, line.name)),
  ];
}
