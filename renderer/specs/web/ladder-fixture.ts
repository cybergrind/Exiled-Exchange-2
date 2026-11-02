// Market state as the app holds it, for the ladder tests: the six recorded GGG
// hours and the relay overview captured the same morning
// (specs/fixtures/market/SOURCES.md).
import fs from "fs";
import path from "path";
import type { LadderItem } from "@/web/price-check/ladder/ladder.ts";
import { aggregatePairs } from "@/web/background/market/cx.ts";
import type { CxHour } from "@/web/background/market/types.ts";
import { cxHour, cxHourIds, fixture } from "./market/prices-harness";

export const TABLE = aggregatePairs(
  cxHourIds().map((hour) => ({
    hour,
    digest: JSON.parse(cxHour(hour)) as CxHour,
  })),
  "Forbidden Rites",
);

interface RelayLine {
  name: string;
  primaryValue?: number;
  sparkline?: { totalChange?: number };
}

export const OVERVIEW = JSON.parse(
  fixture("relay-overview-forbidden-rites.json"),
) as { itemOverviews: Array<{ type: string; lines: RelayLine[] }> };

// name -> GGG metadata ids, from the committed WP-10 map.
const CX_IDS = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/data/poe-source/cx-ids.json"),
    "utf8",
  ),
) as { ids: Record<string, { name: string; ns: string }> };
const IDS_BY_NAME = new Map<string, string[]>();
for (const [id, { name }] of Object.entries(CX_IDS.ids)) {
  IDS_BY_NAME.set(name, [...(IDS_BY_NAME.get(name) ?? []), id]);
}

/** A relay category as ladder input: poe.ninja line plus GGG pairs, if any. */
export function categoryItems(type: string): LadderItem[] {
  const overview = OVERVIEW.itemOverviews.find((o) => o.type === type)!;
  return overview.lines.map((line) => {
    const id = IDS_BY_NAME.get(line.name)?.find((id) => TABLE[id]);
    return {
      name: line.name,
      ns: "ITEM",
      ninja:
        line.primaryValue != null
          ? {
              primaryValue: line.primaryValue,
              totalChange: line.sparkline?.totalChange,
            }
          : undefined,
      pairs: id ? TABLE[id] : undefined,
    };
  });
}
