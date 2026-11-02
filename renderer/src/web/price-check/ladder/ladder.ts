// Where an exchange item sits in its poe.ninja category.
// guide/poe-source.html, D6 (ladder) and D2 (display vs ordering value).
// Pure and Node-runnable like market/: relative .ts imports, no Vue, no `@/`.

import {
  exchangeValue,
  quoteRate,
} from "../../background/market/exchangeValue.ts";
import type {
  CoreCurrency,
  ExchangeValue,
} from "../../background/market/exchangeValue.ts";
import { THIN_TRADED } from "../../background/market/constants.ts";
import type { ItemPairs, PairTable } from "../../background/market/types.ts";

export interface LadderItem {
  name: string;
  ns: string;
  icon?: string;
  /** poe.ninja line: value in divines and the 7-day sparkline change, %. */
  ninja?: { primaryValue: number; totalChange?: number };
  /** GGG pair stats, if the feed trades the item. */
  pairs?: ItemPairs;
}

export interface LadderInput {
  /** Every item of the category, in poe.ninja's order. */
  items: LadderItem[];
  table: PairTable;
  core: CoreCurrency;
  /** Name of the item being price-checked. */
  checked: string;
  /** Rows shown above and below the checked item. Default 5. */
  window?: number;
}

export interface LadderRow {
  name: string;
  /** The name without the words most of the category shares; full name as tooltip. */
  label: string;
  ns: string;
  icon?: string;
  /** 1-based position in the ranked list. */
  rank: number;
  /** D2 display value; null when the item has no price at all. */
  value: ExchangeValue | null;
  /** Core-currency value used for ranking; null sorts last. */
  ordering: number | null;
  /** True for rule 3 rows: a converted poe.ninja estimate, not a pair rate. */
  estimate: boolean;
  /** The pair shown traded fewer than THIN_TRADED units. */
  thin: boolean;
  /** poe.ninja 7-day change in percent. */
  change: number | null;
  /** Log-scale position between the category's lowest and highest value, 0..1. */
  bar: number;
  /** No price: placed last. */
  noValue: boolean;
  checked: boolean;
}

export interface LadderDivider {
  label: "1 div" | "1 ex";
  /** The threshold in ordering units (core currency). */
  ordering: number;
  /** The divider sits before rows[index]; rows above are worth at least `ordering`. */
  index: number;
}

export interface Ladder {
  core: CoreCurrency;
  rows: LadderRow[];
  /** Rank of the checked item, or null if it is not in the category. */
  rank: number | null;
  total: number;
  /** Rows to show by default: rows.slice(start, end). */
  window: { start: number; end: number };
  /** Ordered top to bottom; only those that fall between two priced rows. */
  dividers: LadderDivider[];
}

export const DEFAULT_WINDOW = 5;

/**
 * The 14 exchange categories (relay namespaceMap entries with `cx: true`),
 * keyed by poe.ninja overview type, with the name used in "12 of 38 Omens".
 */
export const LADDER_CATEGORIES: Record<string, string> = {
  Currency: "Currency",
  Fragments: "Fragments",
  Abyss: "Abyssal Bones",
  UncutGems: "Uncut Gems",
  LineageSupportGems: "Lineage Gems",
  Essences: "Essences",
  Ultimatum: "Soul Cores",
  Idols: "Idols",
  Runes: "Runes",
  Ritual: "Omens",
  Expedition: "Expedition",
  Delirium: "Distilled Emotions",
  Breach: "Breach Catalysts",
  Verisium: "Verisium",
};

/** A word is shared when at least this share of the category's names has it. */
const SHARED_WORD_SHARE = 0.75;

/**
 * Short labels for a category: "Greater Essence of Seeking" -> "Greater
 * Seeking" among essences, "Omen of Light" -> "Light" among omens. A name
 * that would lose every word keeps it in full.
 */
export function shortNames(names: readonly string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const name of names) {
    for (const word of new Set(name.split(/\s+/))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const shared = new Set(
    [...counts]
      .filter(
        ([, n]) => n >= SHARED_WORD_SHARE * names.length && names.length > 1,
      )
      .map(([word]) => word),
  );
  const out = new Map<string, string>();
  for (const name of names) {
    const words = name.split(/\s+/).filter((word) => !shared.has(word));
    while (words[0] === "of") words.shift();
    out.set(name, words.length ? words.join(" ") : name);
  }
  return out;
}

export function buildLadder(input: LadderInput): Ladder {
  const { items, table, core, checked } = input;
  const size = input.window ?? DEFAULT_WINDOW;

  const valued = items.map((item, index) => {
    const value = exchangeValue({
      pairs: item.pairs,
      core,
      table,
      ninja: item.ninja,
    });
    const ordering =
      value && Number.isFinite(value.ordering) && value.ordering > 0
        ? value.ordering
        : null;
    return { item, index, value, ordering };
  });

  // Descending; unpriced last; equal values keep their input order.
  valued.sort((a, b) => {
    if (a.ordering === null || b.ordering === null) {
      if (a.ordering !== b.ordering) return a.ordering === null ? 1 : -1;
      return a.index - b.index;
    }
    return b.ordering - a.ordering || a.index - b.index;
  });

  const priced = valued.filter((v) => v.ordering !== null).length;
  const max = priced ? Math.log(valued[0].ordering!) : 0;
  const min = priced ? Math.log(valued[priced - 1].ordering!) : 0;

  // A poe.ninja estimate is in the core currency (D2 rule 3); from a divine
  // up that reads badly ("16.4k ex"), so it is written in divines, as the
  // headline's autoCurrency does.
  const divine = quoteRate(table, "divine", core);
  const display = (value: ExchangeValue, ordering: number): ExchangeValue =>
    value.rule === 3 && divine !== undefined && ordering >= divine
      ? { ...value, currency: "divine", value: ordering / divine }
      : value;

  const labels = shortNames(items.map((item) => item.name));
  const rows: LadderRow[] = valued.map(({ item, value, ordering }, i) => ({
    name: item.name,
    label: labels.get(item.name) ?? item.name,
    ns: item.ns,
    icon: item.icon,
    rank: i + 1,
    value: ordering === null ? null : display(value!, ordering),
    ordering,
    estimate: ordering !== null && value!.rule === 3,
    thin:
      ordering !== null &&
      value!.traded !== undefined &&
      value!.traded < THIN_TRADED,
    change: item.ninja?.totalChange ?? null,
    bar:
      ordering === null
        ? 0
        : max === min
          ? 1
          : (Math.log(ordering) - min) / (max - min),
    noValue: ordering === null,
    checked: item.name === checked,
  }));

  // Always 2 * size + 1 rows when the category has them: near either end
  // the window shifts instead of shrinking, so rank 1 still shows ten others.
  const at = rows.findIndex((row) => row.checked);
  const span = Math.min(rows.length, 2 * size + 1);
  const start =
    at < 0 ? 0 : Math.min(Math.max(0, at - size), rows.length - span);
  const window = { start, end: start + span };

  const dividers: LadderDivider[] = [];
  for (const [label, currency] of [
    ["1 div", "divine"],
    ["1 ex", "exalted"],
  ] as const) {
    const threshold = quoteRate(table, currency, core);
    if (threshold === undefined) continue;
    const index = rows.findIndex(
      (row) => row.ordering === null || row.ordering < threshold,
    );
    if (index > 0 && index < priced) {
      dividers.push({ label, ordering: threshold, index });
    }
  }

  return {
    core,
    rows,
    rank: at < 0 ? null : at + 1,
    total: rows.length,
    window,
    dividers,
  };
}
