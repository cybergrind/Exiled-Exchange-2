// WP-62 · Roll profile validator CLI (guide/poe-source.html, D7).
//
// Run with plain Node (type stripping, no compiler):
//   node tools/validate-rolls.ts                     every research/uniques/*.json
//   node tools/validate-rolls.ts <file>...           just these files
//
// Checks each file against the D7 schema with the app's English stats.ndjson (statRef)
// and items.ndjson (unique names). Prints every error as `<file>: <json path>: <message>`
// on stderr and exits 1 if there is any; exits 0 when all files are valid. Files whose
// name starts with "_" (notes such as _mechanics.md) are ignored by the default glob.

import fs from "node:fs";
import path from "node:path";
import {
  statLookupFromNdjson,
  uniqueNamesFromNdjson,
  validateRollProfile,
} from "../renderer/src/web/background/market/rollProfileSchema.ts";
import type { ValidationError } from "../renderer/src/web/background/market/rollProfileSchema.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const STATS_FILE = path.join(ROOT, "renderer/public/data/en/stats.ndjson");
// items-patch.ndjson serves uniques the generated file lacks (renamed ones).
const ITEMS_FILES = ["items.ndjson", "items-patch.ndjson"].map((name) =>
  path.join(ROOT, "renderer/public/data/en", name),
);
const DEFAULT_DIR = path.join(ROOT, "research/uniques");

function defaultFiles(): string[] {
  if (!fs.existsSync(DEFAULT_DIR)) return [];
  return fs
    .readdirSync(DEFAULT_DIR)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .sort()
    .map((name) => path.join(DEFAULT_DIR, name));
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "Usage: node tools/validate-rolls.ts [file.json...]\n" +
        "Default: research/uniques/*.json (names starting with _ are skipped).\n" +
        "Exit status: 0 all valid, 1 any error.",
    );
    return 0;
  }
  const files = argv.length ? argv : defaultFiles();
  const statBetter = statLookupFromNdjson(fs.readFileSync(STATS_FILE, "utf8"));
  const uniques = uniqueNamesFromNdjson(
    ITEMS_FILES.map((file) => fs.readFileSync(file, "utf8")).join("\n"),
  );
  const opts = { statBetter, hasUnique: (name: string) => uniques.has(name) };

  let failed = 0;
  for (const file of files) {
    let errors: ValidationError[];
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      errors = validateRollProfile(data, opts);
    } catch (e) {
      errors = [
        { path: "$", message: e instanceof Error ? e.message : String(e) },
      ];
    }
    for (const err of errors) {
      console.error(`${file}: ${err.path}: ${err.message}`);
    }
    if (errors.length) failed++;
  }
  console.log(`validate-rolls: ${files.length} file(s), ${failed} with errors`);
  return failed ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
