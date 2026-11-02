// Local price history (guide/poe-source.html, WP-30): <slug>.history.ndjson.
// One line per GGG hour with every pair of the league; hours older than
// HOURLY_DAYS are merged into one line per day; days older than HISTORY_DAYS
// are dropped. GGG hours never change, so the first copy of an hour wins.
//
// Type imports only: main bundles this file for its /market route, and main's
// compiler refuses value imports with a .ts extension.
import type { PairTable, QuoteCurrency } from "./types.ts";

export const HOURLY_DAYS = 7;
export const HISTORY_DAYS = 90;

const DAY = 86400;
const QUOTES: QuoteCurrency[] = ["exalted", "chaos", "divine"];

/** [typical, low, high, traded, quoteTraded], as in PairStat. */
export type HistoryStat = [number, number, number, number, number];
export type HistoryPairs = Record<
  string,
  Partial<Record<QuoteCurrency, HistoryStat>>
>;

export interface HourPoint {
  v: 1;
  hour: number;
  pairs: HistoryPairs;
}

export interface DayPoint {
  v: 1;
  /** Unix time of the UTC day's start. */
  day: number;
  /** The hours merged into this day, so none is merged twice. */
  hours: number[];
  pairs: HistoryPairs;
}

export type HistoryPoint = HourPoint | DayPoint;

export function isDayPoint(point: HistoryPoint): point is DayPoint {
  return "day" in point;
}

/** Start of the point's period, for ordering and charts. */
export function pointTime(point: HistoryPoint): number {
  return isDayPoint(point) ? point.day : point.hour;
}

/** One hour of one league: pass aggregatePairs([that hour], league). */
export function historyPoint(hour: number, table: PairTable): HourPoint {
  const pairs: HistoryPairs = {};
  for (const [id, quotes] of Object.entries(table)) {
    for (const quote of QUOTES) {
      const s = quotes[quote];
      if (!s) continue;
      (pairs[id] ??= {})[quote] = [
        s.typical,
        s.low,
        s.high,
        s.traded,
        s.quoteTraded,
      ];
    }
  }
  return { v: 1, hour, pairs };
}

function sortedPairs(pairs: HistoryPairs): HistoryPairs {
  const out: HistoryPairs = {};
  for (const id of Object.keys(pairs).sort()) {
    const quotes: Partial<Record<QuoteCurrency, HistoryStat>> = {};
    for (const quote of QUOTES) {
      const s = pairs[id][quote];
      if (s) quotes[quote] = s;
    }
    out[id] = quotes;
  }
  return out;
}

/** One line, keys in a fixed order so equal points give equal text. */
export function serializePoint(point: HistoryPoint): string {
  return isDayPoint(point)
    ? JSON.stringify({
        v: 1,
        day: point.day,
        hours: [...point.hours].sort((a, b) => a - b),
        pairs: sortedPairs(point.pairs),
      })
    : JSON.stringify({
        v: 1,
        hour: point.hour,
        pairs: sortedPairs(point.pairs),
      });
}

function isStat(value: unknown): value is HistoryStat {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Every point in the file, in file order. Lines of the first, provisional
 * format ({hour, id, quote, typical, …}, one per pair) are grouped into hour
 * points. Lines that are neither are counted in `skipped`.
 */
export function parseHistory(text: string): {
  points: HistoryPoint[];
  skipped: number;
} {
  const points: HistoryPoint[] = [];
  const legacy = new Map<number, HourPoint>();
  let skipped = 0;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(line) as Record<string, unknown>;
    } catch {
      skipped++;
      continue;
    }
    if (typeof value !== "object" || value === null) {
      skipped++;
      continue;
    }
    const pairs = value.pairs as HistoryPairs | undefined;
    if (value.v === 1 && typeof pairs === "object" && pairs !== null) {
      if (typeof value.hour === "number") {
        points.push({ v: 1, hour: value.hour, pairs });
        continue;
      }
      if (typeof value.day === "number" && Array.isArray(value.hours)) {
        points.push({
          v: 1,
          day: value.day,
          hours: value.hours as number[],
          pairs,
        });
        continue;
      }
    }
    // The provisional per-pair format.
    const { hour, id, quote } = value;
    const stat = [
      value.typical,
      value.low,
      value.high,
      value.traded,
      value.quoteTraded,
    ];
    if (
      typeof hour === "number" &&
      typeof id === "string" &&
      QUOTES.includes(quote as QuoteCurrency) &&
      isStat(stat)
    ) {
      let point = legacy.get(hour);
      if (!point) {
        point = { v: 1, hour, pairs: {} };
        legacy.set(hour, point);
        points.push(point);
      }
      const quotes = (point.pairs[id] ??= {});
      quotes[quote as QuoteCurrency] ??= stat;
      continue;
    }
    skipped++;
  }
  return { points, skipped };
}

/** Adds `b` into `a`: traded and quote traded summed, range widened. */
function combine(a: HistoryPairs, b: HistoryPairs): void {
  for (const [id, quotes] of Object.entries(b)) {
    for (const quote of QUOTES) {
      const add = quotes[quote];
      if (!add) continue;
      const into = (a[id] ??= {});
      const has = into[quote];
      if (!has) {
        into[quote] = [...add];
        continue;
      }
      const traded = has[3] + add[3];
      const quoteTraded = has[4] + add[4];
      into[quote] = [
        traded > 0 ? quoteTraded / traded : has[0],
        Math.min(has[1], add[1]),
        Math.max(has[2], add[2]),
        traded,
        quoteTraded,
      ];
    }
  }
}

const dayOf = (hour: number) => Math.floor(hour / DAY) * DAY;

/**
 * `existing` is the file, `incoming` new lines (normally hour points). Returns
 * the whole new file: duplicates dropped, old hours merged into days, points
 * past HISTORY_DAYS removed, oldest first.
 */
export function mergeHistory(
  existing: string,
  incoming: string,
  nowMs: number,
): { text: string; added: number[]; skipped: number } {
  const hours = new Map<number, HourPoint>();
  const days = new Map<number, DayPoint>();
  const holds = (hour: number) =>
    hours.has(hour) || (days.get(dayOf(hour))?.hours.includes(hour) ?? false);

  const old = parseHistory(existing);
  for (const point of old.points) {
    if (isDayPoint(point)) {
      if (!days.has(point.day)) days.set(point.day, point);
    } else if (!holds(point.hour)) {
      hours.set(point.hour, point);
    }
  }

  const added: number[] = [];
  const fresh = parseHistory(incoming);
  for (const point of fresh.points) {
    if (isDayPoint(point) || holds(point.hour)) continue;
    hours.set(point.hour, point);
    added.push(point.hour);
  }

  const now = Math.floor(nowMs / 1000);
  const hourlyFrom = now - HOURLY_DAYS * DAY;
  const keepFrom = dayOf(now) - HISTORY_DAYS * DAY;
  for (const [hour, point] of [...hours]) {
    if (hour >= hourlyFrom) continue;
    hours.delete(hour);
    const day = dayOf(hour);
    if (day < keepFrom) continue;
    let into = days.get(day);
    if (!into) {
      into = { v: 1, day, hours: [], pairs: {} };
      days.set(day, into);
    }
    combine(into.pairs, point.pairs);
    into.hours.push(hour);
  }
  for (const day of [...days.keys()]) {
    if (day < keepFrom) days.delete(day);
  }

  const points: HistoryPoint[] = [
    ...[...days.values()].sort((a, b) => a.day - b.day),
    ...[...hours.values()].sort((a, b) => a.hour - b.hour),
  ];
  return {
    text: points.length ? `${points.map(serializePoint).join("\n")}\n` : "",
    added: added.sort((a, b) => a - b),
    skipped: old.skipped + fresh.skipped,
  };
}

