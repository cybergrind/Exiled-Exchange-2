// WP-64 · Merge research/uniques/*.json into the shipped unique-rolls.json
// (guide/poe-source.html, D7). Every file is validated first; one invalid file
// stops the merge. Run with plain Node:
//   node tools/merge-rolls.ts            merge and write
//   node tools/merge-rolls.ts --check    validate and report, write nothing

import fs from "node:fs";
import path from "node:path";
import {
  ROLL_PROFILE_SCHEMA_VERSION,
  statLookupFromNdjson,
  uniqueNamesFromNdjson,
  validateRollProfile,
} from "../renderer/src/web/background/market/rollProfileSchema.ts";
import type { RollProfileFile } from "../renderer/src/web/background/market/rollProfileSchema.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "renderer/public/data");
const RESEARCH = path.join(ROOT, "research/uniques");
const OUT = path.join(DATA, "poe-source/unique-rolls.json");

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const statBetter = statLookupFromNdjson(
    fs.readFileSync(path.join(DATA, "en/stats.ndjson"), "utf8"),
  );
  const uniques = uniqueNamesFromNdjson(
    fs.readFileSync(path.join(DATA, "en/items.ndjson"), "utf8"),
  );
  const opts = { statBetter, hasUnique: (name: string) => uniques.has(name) };

  const files = fs
    .readdirSync(RESEARCH)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort();
  const merged: RollProfileFile = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const next: RollProfileFile["uniques"] = {};
  let failed = 0;
  let verifiedOn = "";
  for (const name of files) {
    const file = path.join(RESEARCH, name);
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as RollProfileFile;
    const errors = validateRollProfile(data, opts);
    for (const err of errors) console.error(`${name}: ${err.path}: ${err.message}`);
    if (errors.length) {
      failed++;
      continue;
    }
    for (const [unique, profile] of Object.entries(data.uniques)) {
      if (next[unique]) {
        console.error(`${name}: ${unique} is already in another file`);
        failed++;
      }
      next[unique] = profile;
    }
    if (data.verifiedOn > verifiedOn) verifiedOn = data.verifiedOn;
  }
  if (failed) {
    console.error(`merge-rolls: ${failed} file(s) with errors, nothing written`);
    return 1;
  }

  const out: RollProfileFile = {
    schemaVersion: ROLL_PROFILE_SCHEMA_VERSION,
    league: merged.league,
    verifiedOn: verifiedOn || merged.verifiedOn,
    uniques: Object.fromEntries(
      Object.entries(next).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  const counts = Object.values(out.uniques).flatMap((u) => u.rolls);
  const tally = (importance: string) =>
    counts.filter((roll) => roll.importance === importance).length;
  console.log(
    `merge-rolls: ${files.length} file(s), ${Object.keys(out.uniques).length} uniques, ` +
      `${tally("key")} key, ${tally("good")} good, ${tally("filler")} filler`,
  );
  if (!check) fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
