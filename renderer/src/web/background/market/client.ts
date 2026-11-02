// GGG Currency Exchange feed client (guide/poe-source.html, D3 and WP-12).
// Runs in the app (through the local proxy, base URL without a scheme) and in
// the Node CLI (base URL with https://), so it knows neither: the caller
// injects fetchText and the base URL. Erasable TypeScript only; see types.ts.
import { WINDOW_HOURS } from "./constants.ts";
import type { CxHour } from "./types.ts";

const HOUR = 3600;

export interface FetchTextResponse {
  status: number;
  body: string;
}

/** Resolves for any HTTP status; rejects only on network failure. */
export type FetchText = (url: string) => Promise<FetchTextResponse>;

export interface FetchCxWindowOptions {
  fetchText: FetchText;
  /** Prefix the unix hour is appended to, e.g. CX_FEED_URL or "https://" + CX_FEED_URL. */
  baseUrl: string;
  /** Current time in milliseconds since the epoch (Date.now()). */
  nowMs: number;
  /**
   * Hours already held, keyed by unix hour. Never refetched (digests are
   * immutable) and never modified: merge `fetched` into it afterwards.
   */
  cache?: ReadonlyMap<number, CxHour>;
  /** Hours to return at most. Default WINDOW_HOURS. */
  window?: number;
  /** Requests per call at most. Default window + 2. */
  maxRequests?: number;
}

/** Same shape as cx.ts's CxHourEntry, so `hours` feeds aggregatePairs directly. */
export interface CxWindowHour {
  hour: number;
  digest: CxHour;
}

export interface CxFeedError {
  /** The unix hour the error is about. */
  hour: number;
  /** HTTP status, when a response arrived. */
  status?: number;
  message: string;
}

export interface CxWindowResult {
  /** At most `window` hours, ascending; cached and freshly fetched. */
  hours: CxWindowHour[];
  /** Hours fetched in this call, in request order (newest first). */
  fetched: number[];
  errors: CxFeedError[];
}

/** Newest hour that may be published: floor(now/3600)*3600 − 3600 (D3). */
export function newestCandidateHour(nowMs: number): number {
  return Math.floor(nowMs / 1000 / HOUR) * HOUR - HOUR;
}

type HourOutcome =
  | { kind: "ok"; digest: CxHour }
  | { kind: "end-of-stream" }
  | { kind: "error"; error: CxFeedError };

function parseDigest(body: string): CxHour | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { next_change_id: next, markets } = value as Partial<CxHour>;
  if (typeof next !== "number" || !Array.isArray(markets)) return undefined;
  return value as CxHour;
}

async function fetchHour(
  fetchText: FetchText,
  baseUrl: string,
  hour: number,
): Promise<HourOutcome> {
  let res: FetchTextResponse;
  try {
    res = await fetchText(`${baseUrl.replace(/\/+$/, "")}/${hour}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", error: { hour, message: `network: ${message}` } };
  }
  const digest = parseDigest(res.body);
  if (res.status === 404) {
    // The documented end of stream: this hour is not published yet.
    if (
      digest &&
      digest.markets.length === 0 &&
      digest.next_change_id === hour
    ) {
      return { kind: "end-of-stream" };
    }
    return {
      kind: "error",
      error: { hour, status: 404, message: "not found" },
    };
  }
  if (res.status !== 200) {
    return {
      kind: "error",
      error: { hour, status: res.status, message: `HTTP ${res.status}` },
    };
  }
  if (!digest) {
    return {
      kind: "error",
      error: { hour, status: 200, message: "unparsable body" },
    };
  }
  // An empty hour is never kept: cached once, it would be immutable for good.
  if (digest.markets.length === 0) {
    return {
      kind: "error",
      error: { hour, status: 200, message: "empty markets" },
    };
  }
  return { kind: "ok", digest };
}

/**
 * The newest `window` published hours, ascending. Requests run one at a time,
 * newest first, and stop at `maxRequests`. The window ends at the newest hour
 * that is not an end-of-stream 404; failed hours inside it are reported in
 * `errors` and left out, so the result can be shorter than `window`.
 */
export async function fetchCxWindow(
  opts: FetchCxWindowOptions,
): Promise<CxWindowResult> {
  const { fetchText, baseUrl, nowMs } = opts;
  const cache = opts.cache ?? new Map<number, CxHour>();
  const window = opts.window ?? WINDOW_HOURS;
  const maxRequests = opts.maxRequests ?? window + 2;

  const got = new Map<number, CxHour>();
  const fetched: number[] = [];
  const errors: CxFeedError[] = [];
  let requests = 0;

  const resolve = async (hour: number): Promise<HourOutcome> => {
    const cached = cache.get(hour);
    if (cached) return { kind: "ok", digest: cached };
    requests++;
    const outcome = await fetchHour(fetchText, baseUrl, hour);
    if (outcome.kind === "ok") fetched.push(hour);
    return outcome;
  };
  const record = (hour: number, outcome: HourOutcome) => {
    if (outcome.kind === "ok") got.set(hour, outcome.digest);
    else if (outcome.kind === "error") errors.push(outcome.error);
  };

  // Find the newest published hour, stepping back past end-of-stream 404s.
  let newest: number | undefined;
  let hour = newestCandidateHour(nowMs);
  while (newest === undefined) {
    if (!cache.has(hour) && requests >= maxRequests) {
      errors.push({
        hour,
        message: "request limit reached before a published hour",
      });
      break;
    }
    const outcome = await resolve(hour);
    if (outcome.kind === "end-of-stream") {
      hour -= HOUR;
      continue;
    }
    newest = hour;
    record(hour, outcome);
  }

  if (newest !== undefined) {
    for (let k = 1; k < window; k++) {
      hour = newest - k * HOUR;
      if (!cache.has(hour) && requests >= maxRequests) {
        errors.push({ hour, message: "request limit reached" });
        continue;
      }
      const outcome = await resolve(hour);
      if (outcome.kind === "end-of-stream") {
        // Older than a published hour, so not "not yet": treat as missing.
        errors.push({
          hour,
          status: 404,
          message: "end of stream below a published hour",
        });
      } else {
        record(hour, outcome);
      }
    }
  }

  const hours = [...got.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-window)
    .map(([h, digest]) => ({ hour: h, digest }));
  return { hours, fetched, errors };
}
