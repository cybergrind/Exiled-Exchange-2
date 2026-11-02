// Snapshot file, one per league (guide/poe-source.html, D4 and WP-20).
// Written by the update-prices CLI and, later, the app through main's route;
// read by the app at start. Pure: no file access here. Erasable TypeScript.
import type { PairTable } from "./types.ts";
import type { UniqueLine } from "./uniques.ts";

export const SNAPSHOT_VERSION = 1;

export interface SnapshotCx {
  /** Newest unix hour aggregated. */
  asOfHour: number;
  /** Unix hours aggregated, ascending. */
  hours: number[];
  pairs: PairTable;
}

export interface SnapshotRelay {
  /** When the relay last answered (200 or 304). */
  fetchedAt: string;
  etag?: string;
  /** overviewData.json as received, parsed. */
  overview: unknown;
}

export interface SnapshotUniques {
  /** When the newest unique type answered. */
  fetchedAt: string;
  /** All unique types, merged per type by uniques.ts's mergeUniqueLines. */
  lines: UniqueLine[];
}

export interface Snapshot {
  schemaVersion: typeof SNAPSHOT_VERSION;
  league: string;
  writtenAt: string;
  /** Null when the feed has never answered for this file. */
  cx: SnapshotCx | null;
  /** Null when the relay has never answered for this file. */
  relay: SnapshotRelay | null;
  /** Added by WP-50; absent in older files and until uniques are fetched. */
  uniques?: SnapshotUniques;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "HC Forbidden Rites" -> "hc-forbidden-rites". Never contains a path separator. */
export function leagueSlug(league: string): string {
  const slug = league
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!isValidSlug(slug))
    throw new Error(`No file name for league "${league}"`);
  return slug;
}

/** For anything that takes a slug from outside, such as main's file route. */
export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export function snapshotFileName(league: string): string {
  return `${leagueSlug(league)}.json`;
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The fields every reader of a unique line relies on. */
function isUniqueLineShape(line: unknown): boolean {
  return (
    isObject(line) &&
    typeof line.type === "string" &&
    typeof line.name === "string" &&
    typeof line.baseType === "string" &&
    typeof line.primaryValue === "number" &&
    typeof line.listingCount === "number"
  );
}

/** Throws on anything that is not a version-1 snapshot. */
export function parseSnapshot(text: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Snapshot is not JSON");
  }
  if (!isObject(value)) throw new Error("Snapshot is not an object");
  if (value.schemaVersion !== SNAPSHOT_VERSION) {
    throw new Error(
      `Unknown snapshot schema ${JSON.stringify(value.schemaVersion)}, expected ${SNAPSHOT_VERSION}`,
    );
  }
  if (typeof value.league !== "string" || !value.league) {
    throw new Error("Snapshot has no league");
  }
  if (
    typeof value.writtenAt !== "string" ||
    Number.isNaN(Date.parse(value.writtenAt))
  ) {
    throw new Error("Snapshot has no valid writtenAt");
  }
  const cx = value.cx;
  if (
    cx !== null &&
    !(
      isObject(cx) &&
      typeof cx.asOfHour === "number" &&
      Array.isArray(cx.hours) &&
      isObject(cx.pairs)
    )
  ) {
    throw new Error("Snapshot cx block is malformed");
  }
  const relay = value.relay;
  if (
    relay !== null &&
    !(isObject(relay) && typeof relay.fetchedAt === "string")
  ) {
    throw new Error("Snapshot relay block is malformed");
  }
  const uniques = value.uniques;
  if (
    uniques !== undefined &&
    !(
      isObject(uniques) &&
      typeof uniques.fetchedAt === "string" &&
      Array.isArray(uniques.lines) &&
      uniques.lines.every(isUniqueLineShape)
    )
  ) {
    throw new Error("Snapshot uniques block is malformed");
  }
  return value as unknown as Snapshot;
}

/**
 * Whether a refresh is due: no snapshot, another league's, or older than
 * `maxAgeMinutes`. The CLI owns this decision (D4); ./run only passes 60.
 */
export function isSnapshotStale(
  snapshot: Snapshot | undefined,
  maxAgeMinutes: number,
  nowMs: number,
  league?: string,
): boolean {
  if (!snapshot) return true;
  if (league !== undefined && snapshot.league !== league) return true;
  return nowMs - Date.parse(snapshot.writtenAt) > maxAgeMinutes * 60_000;
}
