// main's /market/ route (guide/poe-source.html, D4, WP-23 and WP-25): the
// running app reads and writes <userData>/apt-data/market/ through it,
// because the renderer cannot touch the disk. Everything but the file system
// lives here, so it is unit-tested from renderer/specs/web/market/; main
// (main/src/server.ts) supplies the disk.
//
// Erasable TypeScript only; see types.ts. main imports this file too, and
// main's tsc rejects value imports ending in ".ts", so this file has type
// imports only: snapshot.ts's own functions come in as `rules`.
import type { Snapshot } from "./snapshot.ts";

/**
 * Cap for PUT <slug>.json. A snapshot was 520 KB on 2026-11-02 (relay
 * overview 324 KB, pair table 198 KB). WP-50 adds trimmed unique lines from
 * stash overviews that are 1.2 MB in full, so about 2 MB is the expected
 * ceiling; 8 MiB leaves 4x on that and still bounds what one request can
 * make main hold in memory.
 */
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

/**
 * Cap for POST <slug>.history. One line per hour per pair is about 130 bytes,
 * and a 6-hour window had 1,411 pairs: about 180 KB an hour, 1.1 MB for the
 * 6 hours fetched at start. 4 MiB is 3.5x that.
 */
export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;

export const SNAPSHOT_CONTENT_TYPE = "application/json";
/**
 * Writes must carry these types. Neither is a CORS "simple" type, so a web
 * page that guesses the port cannot write without a preflight, which this
 * server never grants.
 */
export const HISTORY_CONTENT_TYPE = "application/x-ndjson";

/** snapshot.ts's functions, passed in rather than imported (see above). */
export interface SnapshotRules {
  isValidSlug: (slug: string) => boolean;
  leagueSlug: (league: string) => string;
  /** Throws on anything that is not a version-1 snapshot. */
  parseSnapshot: (text: string) => Snapshot;
}

export type MarketAction =
  | "read-snapshot"
  | "write-snapshot"
  | "append-history";

export interface MarketTarget {
  action: MarketAction;
  slug: string;
  /** File name under the market directory: never a path. */
  file: string;
  /** Body cap; 0 for reads. */
  maxBytes: number;
  /** Required request content type; empty for reads. */
  contentType: string;
}

export type MarketRoute =
  | { ok: true; target: MarketTarget }
  | { ok: false; status: 400 | 405; message: string; allow?: string };

/** Whether a request URL belongs to this route (and not the static files). */
export function isMarketUrl(url: string | undefined): boolean {
  return url !== undefined && /^\/market(?:[/?#]|$)/.test(url);
}

const NAME = /^\/market\/([^/]+)\.(json|history)$/;

/**
 * GET and PUT /market/<slug>.json, POST /market/<slug>.history. Anything
 * else under /market is refused: no query, no encoding, no subdirectory, and
 * the slug must pass snapshot.ts's isValidSlug. Undefined for other URLs.
 */
export function parseMarketRoute(
  method: string | undefined,
  url: string | undefined,
  rules: Pick<SnapshotRules, "isValidSlug">,
): MarketRoute | undefined {
  if (!isMarketUrl(url)) return undefined;
  const match = NAME.exec(url!);
  if (!match || !rules.isValidSlug(match[1])) {
    return { ok: false, status: 400, message: "Bad market file name" };
  }
  const [, slug, kind] = match;
  if (kind === "json") {
    if (method === "GET") {
      return {
        ok: true,
        target: {
          action: "read-snapshot",
          slug,
          file: `${slug}.json`,
          maxBytes: 0,
          contentType: "",
        },
      };
    }
    if (method === "PUT") {
      return {
        ok: true,
        target: {
          action: "write-snapshot",
          slug,
          file: `${slug}.json`,
          maxBytes: MAX_SNAPSHOT_BYTES,
          contentType: SNAPSHOT_CONTENT_TYPE,
        },
      };
    }
    return {
      ok: false,
      status: 405,
      message: "Snapshots take GET and PUT",
      allow: "GET, PUT",
    };
  }
  if (method === "POST") {
    return {
      ok: true,
      target: {
        action: "append-history",
        slug,
        file: `${slug}.history.ndjson`,
        maxBytes: MAX_HISTORY_BYTES,
        contentType: HISTORY_CONTENT_TYPE,
      },
    };
  }
  return {
    ok: false,
    status: 405,
    message: "History takes POST",
    allow: "POST",
  };
}

/** The media type of a content-type header, lower case, without parameters. */
function mediaType(header: string | undefined): string {
  return (header ?? "").split(";")[0].trim().toLowerCase();
}

export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; status: 413; message: string };

/**
 * Reads a request body of at most `maxBytes` bytes as UTF-8. Past the cap it
 * keeps reading but stores nothing, so the client still gets an answer and
 * memory stays bounded.
 */
export async function collectBody(
  chunks: AsyncIterable<Uint8Array | string>,
  maxBytes: number,
): Promise<BodyResult> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    size += bytes.length;
    if (size <= maxBytes) parts.push(bytes);
  }
  if (size > maxBytes) {
    return {
      ok: false,
      status: 413,
      message: `Body over ${maxBytes} bytes`,
    };
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return { ok: true, text: new TextDecoder().decode(all) };
}

export type HistoryBody =
  | { ok: true; text: string; lines: number }
  | { ok: false; status: 400; message: string };

/**
 * NDJSON of objects. Blank lines are dropped and every kept line ends in a
 * newline, so appends never run two lines together. The line format itself
 * is WP-30's; this only checks that each line is a JSON object.
 */
export function validateHistoryBody(text: string): HistoryBody {
  const kept: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return { ok: false, status: 400, message: `Line ${i + 1} is not JSON` };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        ok: false,
        status: 400,
        message: `Line ${i + 1} is not an object`,
      };
    }
    kept.push(line);
  }
  return {
    ok: true,
    text: kept.length ? `${kept.join("\n")}\n` : "",
    lines: kept.length,
  };
}

/** A snapshot body: version 1, and for the league its file name says. */
export function validateSnapshotBody(
  slug: string,
  text: string,
  rules: SnapshotRules,
): string | undefined {
  let snapshot: Snapshot;
  try {
    snapshot = rules.parseSnapshot(text);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  let own: string;
  try {
    own = rules.leagueSlug(snapshot.league);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  if (own !== slug) {
    return `Snapshot is for ${snapshot.league}, not ${slug}`;
  }
  return undefined;
}

/** The files under <userData>/apt-data/market/. Names come from parseMarketRoute only. */
export interface MarketDisk {
  /** Undefined when the file does not exist. */
  read: (file: string) => Promise<string | undefined>;
  /** Atomic: temp file and rename. */
  replace: (file: string, text: string) => Promise<void>;
  append: (file: string, text: string) => Promise<void>;
}

export interface MarketRequest {
  method?: string;
  url?: string;
  /** Lower-case names, as Node's IncomingMessage gives them. */
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array | string>;
}

export interface MarketResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function header(req: MarketRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function plain(
  status: number,
  message: string,
  extra: Record<string, string> = {},
): MarketResponse {
  return {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...extra },
    body: message,
  };
}

/**
 * The whole route, given a disk. Undefined for URLs that are not /market:
 * the caller lets other handlers answer those. The body is not read for a
 * refused request.
 */
export async function handleMarketRequest(
  req: MarketRequest,
  disk: MarketDisk,
  rules: SnapshotRules,
): Promise<MarketResponse | undefined> {
  const route = parseMarketRoute(req.method, req.url, rules);
  if (!route) return undefined;
  if (!route.ok) {
    return plain(
      route.status,
      route.message,
      route.allow ? { allow: route.allow } : {},
    );
  }
  const { target } = route;

  if (target.action === "read-snapshot") {
    const text = await disk.read(target.file);
    if (text === undefined) return plain(404, "No snapshot for this league");
    return {
      status: 200,
      headers: {
        "content-type": `${SNAPSHOT_CONTENT_TYPE}; charset=utf-8`,
        "cache-control": "no-store",
      },
      body: text,
    };
  }

  if (mediaType(header(req, "content-type")) !== target.contentType) {
    return plain(415, `Expected content-type ${target.contentType}`);
  }
  const declared = Number(header(req, "content-length"));
  if (Number.isFinite(declared) && declared > target.maxBytes) {
    return plain(413, `Body over ${target.maxBytes} bytes`);
  }
  const body = await collectBody(req.body, target.maxBytes);
  if (!body.ok) return plain(body.status, body.message);

  if (target.action === "write-snapshot") {
    const problem = validateSnapshotBody(target.slug, body.text, rules);
    if (problem) return plain(400, problem);
    await disk.replace(target.file, body.text);
    return { status: 204, headers: {}, body: "" };
  }

  const history = validateHistoryBody(body.text);
  if (!history.ok) return plain(history.status, history.message);
  if (history.lines > 0) await disk.append(target.file, history.text);
  return { status: 204, headers: {}, body: "" };
}
