// WP-62 · Roll profile schema and validator (guide/poe-source.html, D7).
//
// A roll profile says which variable rolls of a unique drive its value, with
// thresholds and the evidence behind each claim. The validator is pure: stat and
// unique lookups are injected, so it runs in tests, in the app and in
// tools/validate-rolls.ts under plain Node (erasable TypeScript, no imports).
//
// statRef is the `ref` of a stats.ndjson entry ("#% increased Armour"), not a trade
// id: it is what the parser attaches to every parsed stat (`stat.ref`), what the
// app's StatFilter carries as `statRef`, it is unique in stats.ndjson and the same in
// every language's file, and it gives the StatBetter direction. Trade ids are not
// one-to-one with stats (local and global variants share a ref) and are absent for
// some stats.

export const ROLL_PROFILE_SCHEMA_VERSION = 1;

export const TIERS = ["A", "B", "C"] as const;
export const IMPORTANCES = ["key", "good", "filler"] as const;
export const EVIDENCE_KINDS = ["market", "guide", "mechanic"] as const;

/** "key" needs this many guides from different hosts when it has no market evidence. */
export const KEY_MIN_INDEPENDENT_GUIDES = 2;

export type Tier = (typeof TIERS)[number];
export type Importance = (typeof IMPORTANCES)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface RollThresholds {
  good: number;
  great: number;
}

export interface RollEntry {
  statRef: string;
  importance: Importance;
  thresholds?: RollThresholds;
  why: string;
  evidence: string[];
}

export interface Evidence {
  kind: EvidenceKind;
  /** market: what was sampled; required there. */
  note?: string;
  /** guide, mechanic: the cited page; required there. */
  url?: string;
  title?: string;
  /** market: research/samples/<slug>.json the note is based on. */
  sample?: string;
  date: string;
}

export interface UniqueRollProfile {
  tier: Tier;
  summary: string;
  rolls: RollEntry[];
  evidence: Record<string, Evidence>;
}

export interface RollProfileFile {
  schemaVersion: 1;
  league: string;
  verifiedOn: string;
  uniques: Record<string, UniqueRollProfile>;
}

export interface ValidationError {
  /** JSON path, e.g. $.uniques["Svalinn"].rolls[0].statRef */
  path: string;
  message: string;
}

export interface ValidateOptions {
  /** StatBetter of a stats.ndjson ref (-1, 0, 1); undefined if the ref is unknown. */
  statBetter: (ref: string) => number | undefined;
  /** If given, every unique name must be known to the app. */
  hasUnique?: (name: string) => boolean;
}

// Normalised (lower case, letters and digits only). Never stored anywhere in
// research or app data: profiles and samples are about items, not people.
const ACCOUNT_LIKE_KEYS = new Set([
  "account",
  "accountname",
  "character",
  "charactername",
  "lastcharactername",
  "ign",
  "seller",
  "sellername",
  "buyer",
  "player",
  "playername",
  "whisper",
  "whispertoken",
]);

// The trade site's whisper template, in any language the app supports it is
// at least this phrase in English.
const WHISPER_TEXT = /\bI would like to buy your\b/i;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

function isAccountLikeKey(key: string): boolean {
  return ACCOUNT_LIKE_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function prop(path: string, key: string): string {
  return IDENT_RE.test(key) ? `${path}.${key}` : entry(path, key);
}

/** A key of a map-valued field (unique names, evidence ids) is always bracketed. */
function entry(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

const MAP_FIELDS = new Set(["uniques", "evidence"]);

function childPath(at: string, parentKey: string | undefined, key: string) {
  return parentKey !== undefined && MAP_FIELDS.has(parentKey)
    ? entry(at, key)
    : prop(at, key);
}

/** Paths of keys that look like account, character or whisper data, at any depth. */
export function findAccountLikeFields(data: unknown, path = "$"): string[] {
  const found: string[] = [];
  const walk = (value: unknown, at: string, key?: string) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        const p = childPath(at, key, k);
        if (isAccountLikeKey(k)) found.push(p);
        else walk(v, p, k);
      }
    }
  };
  walk(data, path);
  return found;
}

/** Paths of string values that contain trade whisper text. */
export function findWhisperText(data: unknown, path = "$"): string[] {
  const found: string[] = [];
  const walk = (value: unknown, at: string, key?: string) => {
    if (typeof value === "string") {
      if (WHISPER_TEXT.test(value)) found.push(at);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${at}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        walk(v, childPath(at, key, k), k);
      }
    }
  };
  walk(data, path);
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function urlHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

const FILE_KEYS = ["schemaVersion", "league", "verifiedOn", "uniques"];
const UNIQUE_KEYS = ["tier", "summary", "rolls", "evidence"];
const ROLL_KEYS = ["statRef", "importance", "thresholds", "why", "evidence"];
const EVIDENCE_KEYS = ["kind", "note", "url", "title", "sample", "date"];
const THRESHOLD_KEYS = ["good", "great"];

export function validateRollProfile(
  data: unknown,
  opts: ValidateOptions,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  // Reported once, here; the shape checks below skip these keys.
  for (const p of findAccountLikeFields(data)) {
    err(p, "account, character or whisper data must not be stored");
  }
  for (const p of findWhisperText(data)) {
    err(p, "contains trade whisper text");
  }
  const unknownKeys = (
    obj: Record<string, unknown>,
    at: string,
    known: string[],
  ) => {
    for (const k of Object.keys(obj)) {
      if (!known.includes(k) && !isAccountLikeKey(k)) {
        err(prop(at, k), `unknown field (expected one of ${known.join(", ")})`);
      }
    }
  };

  if (!isRecord(data)) {
    err("$", "expected an object");
    return errors;
  }
  unknownKeys(data, "$", FILE_KEYS);
  if (data.schemaVersion !== ROLL_PROFILE_SCHEMA_VERSION) {
    err("$.schemaVersion", `expected ${ROLL_PROFILE_SCHEMA_VERSION}`);
  }
  if (!nonEmptyString(data.league)) err("$.league", "expected a league name");
  if (!isIsoDate(data.verifiedOn)) {
    err("$.verifiedOn", "expected a date YYYY-MM-DD");
  }
  if (!isRecord(data.uniques)) {
    err("$.uniques", "expected an object keyed by unique name");
    return errors;
  }

  for (const [name, unique] of Object.entries(data.uniques)) {
    const at = entry("$.uniques", name);
    if (isAccountLikeKey(name)) continue;
    if (opts.hasUnique && !opts.hasUnique(name)) {
      err(at, "unique name not found in items.ndjson");
    }
    if (!isRecord(unique)) {
      err(at, "expected an object");
      continue;
    }
    unknownKeys(unique, at, UNIQUE_KEYS);
    if (!(TIERS as readonly unknown[]).includes(unique.tier)) {
      err(`${at}.tier`, `expected one of ${TIERS.join(", ")}`);
    }
    if (!nonEmptyString(unique.summary)) {
      err(`${at}.summary`, "expected one sentence");
    }

    // Evidence first: rolls are checked against what it defines.
    const kinds = new Map<string, { kind: EvidenceKind; host?: string }>();
    if (!isRecord(unique.evidence)) {
      err(`${at}.evidence`, "expected an object keyed by evidence id");
    } else {
      for (const [id, ev] of Object.entries(unique.evidence)) {
        const eat = entry(`${at}.evidence`, id);
        if (isAccountLikeKey(id)) continue;
        if (!isRecord(ev)) {
          err(eat, "expected an object");
          continue;
        }
        unknownKeys(ev, eat, EVIDENCE_KEYS);
        if (!isIsoDate(ev.date))
          err(`${eat}.date`, "expected a date YYYY-MM-DD");
        if (!(EVIDENCE_KINDS as readonly unknown[]).includes(ev.kind)) {
          err(`${eat}.kind`, `expected one of ${EVIDENCE_KINDS.join(", ")}`);
          continue;
        }
        const kind = ev.kind as EvidenceKind;
        let host: string | undefined;
        if (kind === "market") {
          if (!nonEmptyString(ev.note)) {
            err(
              `${eat}.note`,
              "market evidence needs a note of what was sampled",
            );
          }
        } else {
          host = urlHost(ev.url);
          if (!host) err(`${eat}.url`, `${kind} evidence needs an http(s) url`);
        }
        for (const k of ["note", "title", "sample"]) {
          if (ev[k] !== undefined && typeof ev[k] !== "string") {
            err(`${eat}.${k}`, "expected a string");
          }
        }
        if (host || kind === "market") kinds.set(id, { kind, host });
      }
    }

    if (!Array.isArray(unique.rolls)) {
      err(`${at}.rolls`, "expected an array");
      continue;
    }
    unique.rolls.forEach((roll: unknown, i: number) => {
      const rat = `${at}.rolls[${i}]`;
      if (!isRecord(roll)) {
        err(rat, "expected an object");
        return;
      }
      unknownKeys(roll, rat, ROLL_KEYS);

      let better: number | undefined;
      if (!nonEmptyString(roll.statRef)) {
        err(`${rat}.statRef`, "expected the ref of a stats.ndjson entry");
      } else {
        better = opts.statBetter(roll.statRef);
        if (better === undefined) {
          err(`${rat}.statRef`, "not a ref in stats.ndjson");
        }
      }

      const importance = roll.importance;
      const knownImportance = (IMPORTANCES as readonly unknown[]).includes(
        importance,
      );
      if (!knownImportance) {
        err(`${rat}.importance`, `expected one of ${IMPORTANCES.join(", ")}`);
      }
      if (!nonEmptyString(roll.why))
        err(`${rat}.why`, "expected a short reason");

      // Evidence ids and the D7 evidence rules.
      const used: Array<{ kind: EvidenceKind; host?: string }> = [];
      if (!Array.isArray(roll.evidence)) {
        err(`${rat}.evidence`, "expected an array of evidence ids");
      } else {
        roll.evidence.forEach((id: unknown, j: number) => {
          const ev = typeof id === "string" ? kinds.get(id) : undefined;
          if (ev) used.push(ev);
          else if (
            typeof id !== "string" ||
            !isRecord(unique.evidence) ||
            !(id in unique.evidence)
          ) {
            err(`${rat}.evidence[${j}]`, "evidence id not defined");
          }
        });
        const market = used.some((e) => e.kind === "market");
        const guideHosts = new Set(
          used.filter((e) => e.kind === "guide").map((e) => e.host),
        );
        if (
          importance === "key" &&
          !market &&
          guideHosts.size < KEY_MIN_INDEPENDENT_GUIDES
        ) {
          err(
            `${rat}.evidence`,
            `key needs market evidence or ${KEY_MIN_INDEPENDENT_GUIDES} guides from different hosts`,
          );
        }
        if (importance === "good" && !market && guideHosts.size < 1) {
          err(`${rat}.evidence`, "good needs market evidence or one guide");
        }
      }

      // Thresholds, in the stat's better direction.
      const th = roll.thresholds;
      if (th === undefined) {
        if ((importance === "key" || importance === "good") && better) {
          err(`${rat}.thresholds`, `${importance} rolls need thresholds`);
        }
      } else if (!isRecord(th)) {
        err(`${rat}.thresholds`, "expected { good, great }");
      } else {
        unknownKeys(th, `${rat}.thresholds`, THRESHOLD_KEYS);
        let numeric = true;
        for (const k of THRESHOLD_KEYS) {
          if (typeof th[k] !== "number" || !Number.isFinite(th[k])) {
            err(`${rat}.thresholds.${k}`, "expected a number");
            numeric = false;
          }
        }
        if (numeric && better !== undefined) {
          const good = th.good as number;
          const great = th.great as number;
          if (better === 0) {
            err(
              `${rat}.thresholds`,
              "stat has no better direction; omit thresholds",
            );
          } else if (better > 0 ? good > great : good < great) {
            err(
              `${rat}.thresholds`,
              better > 0
                ? "higher is better: good must be <= great"
                : "lower is better: good must be >= great",
            );
          }
        }
      }
    });
  }
  return errors;
}

/** ref -> StatBetter lookup from the text of a stats.ndjson file. */
export function statLookupFromNdjson(
  text: string,
): (ref: string) => number | undefined {
  const better = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const stat = JSON.parse(line) as { ref?: string; better?: number };
    if (typeof stat.ref === "string") better.set(stat.ref, stat.better ?? 0);
  }
  return (ref) => better.get(ref);
}

/** Names of UNIQUE entries in the text of an items.ndjson file. */
export function uniqueNamesFromNdjson(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as { refName?: string; namespace?: string };
    if (item.namespace === "UNIQUE" && item.refName) names.add(item.refName);
  }
  return names;
}
