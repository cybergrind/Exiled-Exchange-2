// WP-61 · Roll sampler (guide/poe-source.html, D7 and P6).
//
// Market evidence for roll research: for each variable mod of a unique, one trade
// search for the low band of its range and one for the high band, recording the
// result count and the cheapest listings' prices. Output per item variant:
// research/samples/<slug>.json, read by the roll research agents (§6 brief).
//
// LIVE RUNS ARE GATE A ONLY. GGG's developer docs do not list the trade search API,
// and the Terms of Use forbid bots and data extraction without written approval
// (see the WP-61 terms note). The tool defaults to refusing; --dry-run prints the
// queries; --live sends them, one at a time, paced by the server's own headers.
//
// Run with plain Node (type stripping, no compiler):
//   node tools/sample-rolls.ts --lines <ninja-overview.json> --dry-run
//   node tools/sample-rolls.ts --lines <ninja-overview.json> --live
//
// Mod ranges come from poe.ninja's mod text for that exact variant (name + base type).
// They only place the sample bands; they are not roll bounds for the app (Rejected
// idea: "Using ninja's mod ranges as true roll bounds").
//
// The app's query builder (renderer/src/web/price-check/trade/pathofexile-trade.ts)
// is tied to Vue, the parser and the app config, so this file has a minimal builder
// for the same trade2 JSON shape. It follows the app in two details: a stat with
// several explicit trade ids becomes a "count" group with min 1, and an inverted
// trade stat has its bounds negated and swapped (getMinMax).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findAccountLikeFields,
  findWhisperText,
} from "../renderer/src/web/background/market/rollProfileSchema.ts";

export const USER_AGENT = "Exiled-Exchange-2 (roll sampler)";
/** Same path the app's requestTradeResultList uses (league id, no realm segment). */
export const TRADE_API = "https://www.pathofexile.com/api/trade2";

/** Each band covers this fraction of the range: bottom third and top third. */
export const BAND_FRACTION = 1 / 3;
/** Listings fetched per band; also the trade fetch endpoint's maximum per call. */
export const CHEAPEST_N = 10;
/** D7's cost estimate assumes 4 rolls per item. */
export const MAX_ROLLS_PER_ITEM = 4;
export const LISTING_STATUS = "online";
/** Corrupted uniques can carry other mods and implicits; they are left out. */
export const EXCLUDE_CORRUPTED = true;

/** Before the first response: the app's own starting limit (1 per 5 s). */
export const DEFAULT_RULES: ReadonlyArray<{ max: number; period: number }> = [
  { max: 1, period: 5 },
];
/** Stay this many hits below each rule's maximum (never below 1 allowed). */
export const HEADROOM = 1;
/** Added to each rule's period, against clock skew and latency. */
export const PERIOD_PAD_S = 1;
/** Never send two requests closer than this. */
export const MIN_INTERVAL_MS = 1500;
/** Wait after a 429 that carries neither Retry-After nor a restriction. */
export const FALLBACK_429_S = 60;
/** Consecutive failed requests (network, 5xx, 429) before the run stops. */
export const MAX_CONSECUTIVE_FAILURES = 3;
export const BACKOFF_BASE_MS = 5_000;

export const SAMPLE_SCHEMA_VERSION = 1;

/**
 * Pilot for Gate A (WP-63): 5 uniques worth 1 div or more in the recorded relay and
 * stash fixtures of 2026-11-02 (renderer/specs/fixtures/market/). Temporalis is the
 * variable-heavy case (5 variable mods) and Svalinn the simple one (3), both
 * confirmed from the stash fixture's mod text. For the other three only the price is
 * recorded (the relay has no mod text): planUnits drops any with fewer than 2
 * variable rolls and says so. TODO(Gate A): confirm against a current overview.
 */
export const PILOT: ReadonlyArray<{ name: string; baseType: string }> = [
  { name: "Temporalis", baseType: "Silk Robe" }, // 6934 div
  { name: "Svalinn", baseType: "Crucible Tower Shield" }, // 2 div
  { name: "Olroth's Resolve", baseType: "Ultimate Life Flask" }, // 8 div
  { name: "The Desperate Alliance", baseType: "Vase Relic" }, // 4.62 div
  { name: "The Last Flame", baseType: "Incense Relic" }, // 6664 div
];

// ---------------------------------------------------------------- types

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface HttpInit {
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
}

export type Http = (url: string, init: HttpInit) => Promise<HttpResponse>;

/** The part of a poe.ninja stash overview line the sampler reads. */
export interface NinjaLine {
  name: string;
  baseType: string;
  explicitModifiers?: Array<{ text: string; statIds?: string[] }>;
}

export interface StatInfo {
  ref: string;
  better: number;
  explicitIds: string[];
  inverted: boolean;
  option: boolean;
}

export interface StatIndex {
  byRef: Map<string, StatInfo>;
  /** Game stat id -> stat, only where the id is unambiguous. */
  byId: Map<string, StatInfo>;
  /** Matcher text ("# to maximum Life") -> stat, negated matchers excluded. */
  byText: Map<string, StatInfo>;
}

export interface Band {
  min: number;
  max: number;
}

export interface SampleUnit {
  key: string;
  slug: string;
  unique: string;
  baseType: string;
  statRef: string;
  tradeIds: string[];
  inverted: boolean;
  range: { lo: number; hi: number };
  band: "low" | "high";
  filter: Band;
}

export interface Skipped {
  unique: string;
  baseType: string;
  text?: string;
  reason: string;
}

export interface Sample {
  statRef: string;
  tradeIds: string[];
  range: { lo: number; hi: number };
  band: "low" | "high";
  filter: Band;
  sampledAt: string;
  total: number;
  inexact?: boolean;
  cheapest: Array<{ amount: number; currency: string }>;
}

export interface SampleFile {
  schemaVersion: number;
  league: string;
  unique: string;
  baseType: string;
  source: string;
  bandFraction: number;
  samples: Sample[];
}

// ---------------------------------------------------------------- planning

export function statIndexFromNdjson(text: string): StatIndex {
  const byRef = new Map<string, StatInfo>();
  const byId = new Map<string, StatInfo>();
  const dupIds = new Set<string>();
  const byText = new Map<string, StatInfo>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const s = JSON.parse(line) as {
      ref: string;
      id?: string;
      better?: number;
      matchers?: Array<{ string: string; negate?: boolean }>;
      trade?: {
        ids?: Record<string, string[]>;
        inverted?: boolean;
        option?: boolean;
      };
    };
    const info: StatInfo = {
      ref: s.ref,
      better: s.better ?? 0,
      explicitIds: s.trade?.ids?.explicit ?? [],
      inverted: Boolean(s.trade?.inverted),
      option: Boolean(s.trade?.option),
    };
    byRef.set(s.ref, info);
    if (s.id) {
      if (byId.has(s.id)) dupIds.add(s.id);
      byId.set(s.id, info);
    }
    for (const m of s.matchers ?? []) {
      if (!m.negate && !byText.has(m.string)) byText.set(m.string, info);
    }
  }
  for (const id of dupIds) byId.delete(id);
  return { byRef, byId, byText };
}

function stripMarkup(text: string): string {
  return text
    .replace(/\[[^\]|]+\|([^\]]+)\]/g, "$1")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const RANGE_RE = /(-?)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;

/** The one (lo-hi) range in a ninja mod text, with the text's range replaced by #. */
export function parseRange(
  raw: string,
): { lo: number; hi: number; text: string } | { skip: string } {
  const text = stripMarkup(raw);
  const ranges = [...text.matchAll(RANGE_RE)];
  if (ranges.length === 0) return { skip: "no range: fixed mod" };
  if (ranges.length > 1) return { skip: "several ranges in one mod" };
  const [whole, sign, a, b] = ranges[0];
  if (sign === "-" || a.startsWith("-") || b.startsWith("-")) {
    return {
      skip: "negative range: sign convention on trade unclear, check by hand",
    };
  }
  const lo = Math.min(Number(a), Number(b));
  const hi = Math.max(Number(a), Number(b));
  return { lo, hi, text: text.replace(whole, "#") };
}

function decimals(n: number) {
  return Number.isInteger(n) ? 0 : 2;
}

function floorTo(x: number, dp: number) {
  const f = 10 ** dp;
  return Math.floor(x * f + 1e-9) / f;
}

function ceilTo(x: number, dp: number) {
  const f = 10 ** dp;
  return Math.ceil(x * f - 1e-9) / f;
}

/** Bottom and top BAND_FRACTION of [lo, hi], rounded inwards to the roll's precision. */
export function rollBands(lo: number, hi: number): { low: Band; high: Band } {
  const dp = Math.max(decimals(lo), decimals(hi));
  const width = (hi - lo) * BAND_FRACTION;
  return {
    low: { min: lo, max: Math.max(lo, floorTo(lo + width, dp)) },
    high: { min: Math.min(hi, ceilTo(hi - width, dp)), max: hi },
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveStat(
  mod: { text: string; statIds?: string[] },
  rangeText: string,
  stats: StatIndex,
): StatInfo | undefined {
  for (const id of mod.statIds ?? []) {
    const s = stats.byId.get(id);
    if (s) return s;
  }
  return (
    stats.byText.get(rangeText) ??
    stats.byText.get(rangeText.replace(/^\+/, ""))
  );
}

export function planUnits(
  lines: NinjaLine[],
  items: ReadonlyArray<{ name: string; baseType: string }>,
  stats: StatIndex,
  opts: { maxRolls?: number } = {},
): { units: SampleUnit[]; skipped: Skipped[] } {
  const maxRolls = opts.maxRolls ?? MAX_ROLLS_PER_ITEM;
  const units: SampleUnit[] = [];
  const skipped: Skipped[] = [];
  for (const item of items) {
    const { name: unique, baseType } = item;
    const line = lines.find(
      (l) =>
        l.name === unique && l.baseType === baseType && l.explicitModifiers,
    );
    if (!line) {
      skipped.push({ unique, baseType, reason: "not in the lines file" });
      continue;
    }
    const slug = slugify(`${unique} ${baseType}`);
    const mine: SampleUnit[] = [];
    let rolls = 0;
    for (const mod of line.explicitModifiers ?? []) {
      const r = parseRange(mod.text);
      if ("skip" in r) {
        skipped.push({ unique, baseType, text: mod.text, reason: r.skip });
        continue;
      }
      if (r.lo === r.hi) {
        skipped.push({
          unique,
          baseType,
          text: mod.text,
          reason: "no range: fixed mod",
        });
        continue;
      }
      const stat = resolveStat(mod, r.text, stats);
      if (!stat) {
        skipped.push({
          unique,
          baseType,
          text: mod.text,
          reason: "no stat in stats.ndjson",
        });
        continue;
      }
      if (!stat.explicitIds.length || stat.option) {
        skipped.push({
          unique,
          baseType,
          text: mod.text,
          reason: "no explicit trade id",
        });
        continue;
      }
      if (rolls >= maxRolls) {
        skipped.push({
          unique,
          baseType,
          text: mod.text,
          reason: `over ${maxRolls} rolls`,
        });
        continue;
      }
      rolls++;
      const bands = rollBands(r.lo, r.hi);
      for (const band of ["low", "high"] as const) {
        const filter = bands[band];
        mine.push({
          key: [
            unique,
            baseType,
            stat.ref,
            band,
            `${filter.min}-${filter.max}`,
          ].join("|"),
          slug,
          unique,
          baseType,
          statRef: stat.ref,
          tradeIds: stat.explicitIds,
          inverted: stat.inverted,
          range: { lo: r.lo, hi: r.hi },
          band,
          filter,
        });
      }
    }
    if (rolls < 2) {
      skipped.push({
        unique,
        baseType,
        reason: `not Tier A: fewer than 2 variable rolls (${rolls})`,
      });
      continue;
    }
    units.push(...mine);
  }
  return { units, skipped };
}

// ---------------------------------------------------------------- query

export interface StatValueFilter {
  id: string;
  value: { min: number; max: number };
}

export interface SearchQuery {
  query: {
    status: { option: string };
    name: string;
    type: string;
    stats: Array<{
      type: "and" | "count";
      value?: { min: number };
      filters: StatValueFilter[];
    }>;
    filters: Record<string, unknown>;
  };
  sort: { price: "asc" };
}

export function buildSearchQuery(
  unit: Pick<
    SampleUnit,
    "unique" | "baseType" | "tradeIds" | "inverted" | "filter"
  >,
): SearchQuery {
  const value = unit.inverted
    ? { min: -unit.filter.max, max: -unit.filter.min }
    : { min: unit.filter.min, max: unit.filter.max };
  const filters = unit.tradeIds.map((id) => ({ id, value: { ...value } }));
  return {
    query: {
      status: { option: LISTING_STATUS },
      name: unit.unique,
      type: unit.baseType,
      stats: [
        filters.length === 1
          ? { type: "and", filters }
          : { type: "count", value: { min: 1 }, filters },
      ],
      filters: EXCLUDE_CORRUPTED
        ? { misc_filters: { filters: { corrupted: { option: "false" } } } }
        : {},
    },
    sort: { price: "asc" },
  };
}

// ---------------------------------------------------------------- pacing

interface RuleState {
  max: number;
  period: number;
  /** Hits the server counted that this process did not send, e.g. the app. */
  extra: number;
  extraUntil: number;
}

/**
 * Paces one endpoint (one GGG policy) by its X-Rate-Limit-* headers. wait() returns
 * when one more request keeps every rule HEADROOM below its maximum, counting this
 * process's own requests plus any surplus the server reported; Retry-After, an
 * active restriction in a state header, and a bare 429 block until they expire.
 */
export class Pacer {
  private clock: Clock;
  private rules: RuleState[];
  private sent: number[] = [];
  private blockedUntil = 0;

  constructor(clock: Clock) {
    this.clock = clock;
    this.rules = DEFAULT_RULES.map((r) => ({ ...r, extra: 0, extraUntil: 0 }));
  }

  async wait(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      const delay = this.delayNeeded(now);
      if (delay <= 0) {
        this.sent.push(now);
        const horizon =
          Math.max(...this.rules.map((r) => r.period)) + PERIOD_PAD_S;
        this.sent = this.sent.filter((t) => t > now - horizon * 1000);
        return;
      }
      await this.clock.sleep(delay);
    }
  }

  delayNeeded(now: number): number {
    const last = this.sent.at(-1);
    let until = Math.max(
      this.blockedUntil,
      last === undefined ? 0 : last + MIN_INTERVAL_MS,
    );
    for (const rule of this.rules) {
      const windowMs = (rule.period + PERIOD_PAD_S) * 1000;
      const allowed = Math.max(1, rule.max - HEADROOM);
      const fits = (t: number) =>
        this.sent.filter((s) => s > t - windowMs).length +
          (t < rule.extraUntil ? rule.extra : 0) +
          1 <=
        allowed;
      const candidates = [
        now,
        ...this.sent.map((s) => s + windowMs),
        rule.extraUntil,
      ]
        .filter((t) => t >= now)
        .sort((a, b) => a - b);
      const t = candidates.find(fits) ?? now + windowMs;
      until = Math.max(until, t);
    }
    return Math.max(0, until - now);
  }

  update(status: number, headers: HttpResponse["headers"]): void {
    const now = this.clock.now();
    const names = headers.get("x-rate-limit-rules");
    if (names) {
      const rules: RuleState[] = [];
      for (const name of names.split(",").map((n) => n.trim().toLowerCase())) {
        const limits = (headers.get(`x-rate-limit-${name}`) ?? "").split(",");
        const states = (headers.get(`x-rate-limit-${name}-state`) ?? "").split(
          ",",
        );
        limits.forEach((limit, i) => {
          const [max, period] = limit.split(":").map(Number);
          if (!(max > 0) || !(period > 0)) return;
          const [hits, , restricted] = (states[i] ?? "").split(":").map(Number);
          const own = this.sent.filter((t) => t > now - period * 1000).length;
          const extra = Number.isFinite(hits) ? Math.max(0, hits - own) : 0;
          rules.push({
            max,
            period,
            extra,
            extraUntil: now + (period + PERIOD_PAD_S) * 1000,
          });
          if (restricted > 0) {
            this.blockedUntil = Math.max(
              this.blockedUntil,
              now + restricted * 1000,
            );
          }
        });
      }
      if (rules.length) this.rules = rules;
    }
    const retryAfter = Number(headers.get("retry-after"));
    if (retryAfter > 0) {
      this.blockedUntil = Math.max(this.blockedUntil, now + retryAfter * 1000);
    }
    if (status === 429 && this.blockedUntil <= now) {
      this.blockedUntil = now + FALLBACK_429_S * 1000;
    }
  }
}

// ---------------------------------------------------------------- run

/** Throws if anything that identifies a player is about to be written. */
export function assertNoAccountData(data: unknown): void {
  const found = [...findAccountLikeFields(data), ...findWhisperText(data)];
  if (found.length) {
    throw new Error(
      `refusing to write account or whisper data at ${found.join(", ")}`,
    );
  }
}

class SamplerStopped extends Error {}

function readJson<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, data: unknown): void {
  assertNoAccountData(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Only amount and currency leave a listing; everything else is dropped here. */
function cheapestPrices(result: unknown): Sample["cheapest"] {
  if (!Array.isArray(result)) return [];
  const prices: Sample["cheapest"] = [];
  for (const r of result) {
    const price = (
      r as {
        listing?: { price?: { amount?: unknown; currency?: unknown } };
      } | null
    )?.listing?.price;
    if (
      typeof price?.amount === "number" &&
      typeof price.currency === "string"
    ) {
      prices.push({
        amount: price.amount,
        currency: price.currency.toLowerCase(),
      });
    }
  }
  return prices;
}

export interface SamplerOptions {
  units: SampleUnit[];
  league: string;
  http: Http;
  clock: Clock;
  outDir: string;
  statePath: string;
  log?: (msg: string) => void;
}

interface StateFile {
  schemaVersion: number;
  league: string;
  done: string[];
}

export async function runSampler(
  opts: SamplerOptions,
): Promise<{ sampled: number }> {
  const { league, http, clock, outDir, statePath } = opts;
  const log = opts.log ?? ((msg: string) => console.log(msg));
  const state: StateFile = readJson<StateFile>(statePath) ?? {
    schemaVersion: 1,
    league,
    done: [],
  };
  if (state.league !== league) {
    throw new Error(`${statePath} is for ${state.league}, not ${league}`);
  }
  const done = new Set(state.done);
  const pacers = { search: new Pacer(clock), fetch: new Pacer(clock) };
  let failures = 0;

  const request = async (pacer: Pacer, url: string, init: HttpInit) => {
    const fail = async (why: string, backoff: boolean) => {
      failures++;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        throw new SamplerStopped(
          `sampler stopped after ${failures} failed requests: ${why}`,
        );
      }
      log(`request failed (${why}); retrying`);
      if (backoff) await clock.sleep(BACKOFF_BASE_MS * 2 ** (failures - 1));
    };
    for (;;) {
      await pacer.wait();
      let res: HttpResponse;
      try {
        res = await http(url, init);
      } catch (e) {
        await fail(e instanceof Error ? e.message : String(e), true);
        continue;
      }
      pacer.update(res.status, res.headers);
      if (res.status === 200) {
        failures = 0;
        return await res.json();
      }
      // The pacer already waits out the 429's Retry-After or restriction.
      if (res.status === 429) await fail("HTTP 429", false);
      else if (res.status >= 500) await fail(`HTTP ${res.status}`, true);
      else
        throw new SamplerStopped(
          `sampler stopped: HTTP ${res.status} for ${url}`,
        );
    }
  };

  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  let sampled = 0;
  for (const unit of opts.units) {
    if (done.has(unit.key)) continue;
    const search = (await request(
      pacers.search,
      `${TRADE_API}/search/${encodeURIComponent(league)}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildSearchQuery(unit)),
      },
    )) as {
      id?: unknown;
      result?: unknown;
      total?: unknown;
      inexact?: unknown;
    };
    const sampledAt = new Date(clock.now()).toISOString();
    if (typeof search?.id !== "string" || !Array.isArray(search.result)) {
      throw new SamplerStopped("sampler stopped: unexpected search response");
    }
    let cheapest: Sample["cheapest"] = [];
    const ids = (search.result as unknown[]).slice(0, CHEAPEST_N);
    if (ids.length) {
      const fetched = (await request(
        pacers.fetch,
        `${TRADE_API}/fetch/${ids.map(String).join(",")}?query=${encodeURIComponent(search.id)}`,
        { method: "GET", headers },
      )) as { result?: unknown };
      cheapest = cheapestPrices(fetched?.result);
    }

    const sample: Sample = {
      statRef: unit.statRef,
      tradeIds: unit.tradeIds,
      range: unit.range,
      band: unit.band,
      filter: unit.filter,
      sampledAt,
      total: typeof search.total === "number" ? search.total : ids.length,
      ...(search.inexact === true ? { inexact: true } : {}),
      cheapest,
    };
    const file = path.join(outDir, `${unit.slug}.json`);
    const out: SampleFile = readJson<SampleFile>(file) ?? {
      schemaVersion: SAMPLE_SCHEMA_VERSION,
      league,
      unique: unit.unique,
      baseType: unit.baseType,
      source: `pathofexile.com trade2 search, status ${LISTING_STATUS}, sorted by price ascending`,
      bandFraction: BAND_FRACTION,
      samples: [],
    };
    out.samples = out.samples.filter(
      (s) => !(s.statRef === unit.statRef && s.band === unit.band),
    );
    out.samples.push(sample);
    writeJson(file, out);
    done.add(unit.key);
    writeJson(statePath, { ...state, done: [...done] });
    sampled++;
    log(
      `${unit.unique} / ${unit.baseType} · ${unit.statRef} · ${unit.band}: ${sample.total} listed, cheapest ${cheapest[0] ? `${cheapest[0].amount} ${cheapest[0].currency}` : "-"}`,
    );
  }
  return { sampled };
}

// ---------------------------------------------------------------- CLI

const ROOT = path.resolve(import.meta.dirname, "..");
const STATS_FILE = path.join(ROOT, "renderer/public/data/en/stats.ndjson");

const USAGE = `Usage: node tools/sample-rolls.ts --lines <file> (--dry-run | --live) [options]

Samples trade prices at the low and high band of each variable roll.
GATE A ONLY for --live: see guide/poe-source.html, P6 and the WP-61 terms note.

  --lines <file>        poe.ninja stash overview JSON ({"lines": [...]}) with mod text
  --unique "Name|Base"  item to sample (repeatable). Default: the 5 pilot uniques
  --league <id>         default "Forbidden Rites"
  --out <dir>           default research/samples
  --state <file>        resume state, default <out>/_state.json
  --max-rolls <n>       variable rolls per item, default ${MAX_ROLLS_PER_ITEM}
  --dry-run             print the queries; no network, nothing written
  --live                send them to the trade site, paced by its headers

Exit status: 0 done, 1 run stopped (state kept; rerun resumes), 2 bad arguments.`;

class UsageError extends Error {}

function parseArgs(argv: string[]) {
  const args = {
    lines: "",
    uniques: [] as Array<{ name: string; baseType: string }>,
    league: "Forbidden Rites",
    out: path.join(ROOT, "research/samples"),
    state: "",
    maxRolls: MAX_ROLLS_PER_ITEM,
    dryRun: false,
    live: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--lines":
        args.lines = value();
        break;
      case "--unique": {
        const [name, baseType] = value().split("|");
        if (!name || !baseType)
          throw new UsageError('--unique needs "Name|Base type"');
        args.uniques.push({ name, baseType });
        break;
      }
      case "--league":
        args.league = value();
        break;
      case "--out":
        args.out = value();
        break;
      case "--state":
        args.state = value();
        break;
      case "--max-rolls":
        args.maxRolls = Number(value());
        if (!(args.maxRolls > 0))
          throw new UsageError("--max-rolls needs a number");
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--live":
        args.live = true;
        break;
      default:
        throw new UsageError(`unknown option ${flag}`);
    }
  }
  return args;
}

async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log(USAGE);
      return 0;
    }
    if (!args.lines) throw new UsageError("--lines is required");
    if (!args.dryRun && !args.live) {
      throw new UsageError(
        "refusing to send trade searches without --live (Gate A only); use --dry-run to see them",
      );
    }
    if (args.dryRun && args.live)
      throw new UsageError("--dry-run and --live exclude each other");
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`${e.message}\n\n${USAGE}`);
      return 2;
    }
    throw e;
  }

  const raw = JSON.parse(fs.readFileSync(args.lines, "utf8")) as
    | { lines?: NinjaLine[] }
    | NinjaLine[];
  const lines = Array.isArray(raw) ? raw : (raw.lines ?? []);
  const stats = statIndexFromNdjson(fs.readFileSync(STATS_FILE, "utf8"));
  const items = args.uniques.length ? args.uniques : PILOT;
  const { units, skipped } = planUnits(lines, items, stats, {
    maxRolls: args.maxRolls,
  });

  for (const s of skipped) {
    console.log(
      `skip ${s.unique} / ${s.baseType}${s.text ? ` · ${s.text}` : ""}: ${s.reason}`,
    );
  }
  if (args.dryRun) {
    for (const unit of units) {
      console.log(
        `# ${unit.unique} / ${unit.baseType} · ${unit.statRef} · ${unit.band} ${unit.filter.min}-${unit.filter.max}`,
      );
      console.log(JSON.stringify(buildSearchQuery(unit), null, 2));
    }
    console.log(
      `${units.length} searches (+ up to ${units.length} fetches) for ${new Set(units.map((u) => u.slug)).size} item(s); nothing sent.`,
    );
    return 0;
  }

  const clock: Clock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const http: Http = async (url, init) => {
    const res = await fetch(url, init);
    return { status: res.status, headers: res.headers, json: () => res.json() };
  };
  try {
    const { sampled } = await runSampler({
      units,
      league: args.league,
      http,
      clock,
      outDir: args.out,
      statePath: args.state || path.join(args.out, "_state.json"),
    });
    console.log(
      `sampled ${sampled} band(s); ${units.length - sampled} were already done`,
    );
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
