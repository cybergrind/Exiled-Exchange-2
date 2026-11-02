// make test-live: check real responses for shape and for empty types
// (guide/poe-source.html, WP-21 and §6 rule 6). Hits the network, so it stays
// out of the default suite. Plain Node, no compiler:
//   node renderer/scripts/live-check.ts [--league <id>]
// Exit status: 0 all checks passed, 1 a check failed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newestCandidateHour } from "../src/web/background/market/client.ts";
import { CX_FEED_URL } from "../src/web/background/market/constants.ts";
import { pickDefaultLeague } from "../src/web/background/market/leagues.ts";
import {
  parseSnapshot,
  snapshotFileName,
} from "../src/web/background/market/snapshot.ts";
import { LEAGUES_URL } from "../src/web/background/market/update.ts";

const USER_AGENT = "Exiled-Exchange-2 (live-check)";
const HOUR = 3600;
const CLI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "update-prices.ts",
);

let failures = 0;
function check(ok: boolean, what: string, detail = ""): boolean {
  process.stdout.write(
    `${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}\n`,
  );
  if (!ok) failures++;
  return ok;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function get(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

async function currentLeague(): Promise<string | undefined> {
  const res = await get(LEAGUES_URL);
  const value = parse(res.body);
  const ids =
    isObject(value) && Array.isArray(value.result)
      ? value.result
          .map((l: unknown) => (isObject(l) ? l.id : undefined))
          .filter((id): id is string => typeof id === "string")
      : [];
  check(
    res.status === 200 && ids.length > 0,
    "league list",
    `HTTP ${res.status}, ${ids.length} leagues`,
  );
  return pickDefaultLeague(ids);
}

/** The CLI into a temporary data dir, then the snapshot it wrote. */
function checkCli(league: string): void {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ee2-live-"));
  try {
    const run = spawnSync(
      process.execPath,
      [CLI, "--league", league, "--data-dir", dataDir],
      { encoding: "utf8", timeout: 120_000 },
    );
    for (const line of `${run.stdout}${run.stderr}`.split("\n")) {
      if (line) process.stdout.write(`     cli: ${line}\n`);
    }
    if (!check(run.status === 0, "update-prices exit", String(run.status))) {
      return;
    }

    const file = path.join(dataDir, "market", snapshotFileName(league));
    let snapshot;
    try {
      snapshot = parseSnapshot(fs.readFileSync(file, "utf8"));
    } catch (err) {
      check(false, "snapshot parses", (err as Error).message);
      return;
    }
    check(snapshot.schemaVersion === 1, "snapshot schemaVersion 1");
    check(snapshot.league === league, "snapshot league", snapshot.league);

    const pairs = snapshot.cx ? Object.keys(snapshot.cx.pairs).length : 0;
    check(pairs > 0, "snapshot cx.pairs non-empty", `${pairs} items`);
    if (snapshot.cx) {
      const ageHours = (Date.now() / 1000 - snapshot.cx.asOfHour) / HOUR;
      check(ageHours < 4, "snapshot cx is recent", `${ageHours.toFixed(1)} h`);
    }

    check(snapshot.relay !== null, "snapshot relay present");
    const overview = snapshot.relay?.overview;
    if (!isObject(overview)) {
      check(false, "relay overview is an object");
      return;
    }
    const core = overview.core;
    check(
      isObject(core) &&
        isObject(core.rates) &&
        typeof core.primary === "string" &&
        Object.values(core.rates).every((r) => typeof r === "number"),
      "relay core rates",
    );
    const types = Array.isArray(overview.itemOverviews)
      ? overview.itemOverviews
      : [];
    check(types.length > 0, "relay itemOverviews", `${types.length} types`);
    const empty: string[] = [];
    const malformed: string[] = [];
    for (const entry of types) {
      if (!isObject(entry) || !Array.isArray(entry.lines)) {
        malformed.push(JSON.stringify(entry).slice(0, 60));
        continue;
      }
      const type = String(entry.type);
      if (entry.lines.length === 0) empty.push(type);
      const bad = entry.lines.filter(
        (line: unknown) =>
          !(
            isObject(line) &&
            typeof line.name === "string" &&
            typeof line.primaryValue === "number" &&
            typeof line.detailsId === "string"
          ),
      ).length;
      if (bad) malformed.push(`${type} (${bad} lines)`);
    }
    check(empty.length === 0, "relay types with lines", empty.join(", "));
    check(malformed.length === 0, "relay line shape", malformed.join(", "));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function isCxHour(value: unknown): value is {
  next_change_id: number;
  markets: unknown[];
} {
  return (
    isObject(value) &&
    typeof value.next_change_id === "number" &&
    Array.isArray(value.markets)
  );
}

/** The documented end of stream, and a recent hour with markets (D3). */
async function checkFeed(): Promise<void> {
  const base = `https://${CX_FEED_URL}`;
  const current = Math.floor(Date.now() / 1000 / HOUR) * HOUR;
  const res = await get(`${base}/${current}`);
  const body = parse(res.body);
  check(
    res.status === 404 &&
      isCxHour(body) &&
      body.next_change_id === current &&
      body.markets.length === 0,
    `feed end of stream at the current hour ${current}`,
    `HTTP ${res.status} ${res.body.slice(0, 80)}`,
  );

  // The newest candidate may not be out yet; three hours back always is.
  const newest = newestCandidateHour(Date.now());
  for (let hour = newest; hour >= newest - 2 * HOUR; hour -= HOUR) {
    const r = await get(`${base}/${hour}`);
    const digest = parse(r.body);
    if (r.status === 404) continue;
    const markets = isCxHour(digest) ? digest.markets : [];
    check(
      r.status === 200 && markets.length > 0,
      `feed hour ${hour} has markets`,
      `HTTP ${r.status}, ${markets.length} markets`,
    );
    const m = markets[0];
    check(
      isObject(m) &&
        typeof m.league === "string" &&
        Array.isArray(m.market_pair) &&
        m.market_pair.length === 2 &&
        ["volume_traded", "lowest_ratio", "highest_ratio"].every((k) =>
          isObject(m[k]),
        ),
      "feed market shape",
    );
    return;
  }
  check(false, "feed has a published hour in the last 3", `from ${newest}`);
}

const leagueFlag = process.argv.indexOf("--league");
const league =
  (leagueFlag >= 0 ? process.argv[leagueFlag + 1] : undefined) ??
  (await currentLeague());
if (!league) {
  check(false, "a league to check");
} else {
  process.stdout.write(`League: ${league}\n`);
  checkCli(league);
  await checkFeed();
}
process.stdout.write(
  failures
    ? `${failures} live check(s) failed.\n`
    : "All live checks passed.\n",
);
process.exitCode = failures ? 1 : 0;
