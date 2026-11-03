// Which surveyed builds use each unique, for the price panel's "Used by" line.
// Reads the Builds table of research/uniques/_meta-builds.md (public guides and
// tier lists only; poe.ninja builds data is off limits) and writes
// renderer/public/data/poe-source/unique-builds.json. Run with plain Node:
//   node tools/build-unique-builds.ts [--check]

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "research/uniques/_meta-builds.md");
const ITEMS = ["items.ndjson", "items-patch.ndjson"].map((name) =>
  path.join(ROOT, "renderer/public/data/en", name),
);
const OUT = path.join(
  ROOT,
  "renderer/public/data/poe-source/unique-builds.json",
);

import type {
  BuildUse,
  SurveyBuild,
  UniqueBuildsFile,
} from "../renderer/src/web/price-check/trends/buildUsage.ts";

/** "A, B (endgame), C (budget alt to X)" → names with their labels. */
export function splitUniques(
  cell: string,
): Array<{ name: string; label?: string }> {
  if (cell.trim() === "none") return [];
  const out: Array<{ name: string; label?: string }> = [];
  let depth = 0;
  let current = "";
  for (const ch of cell) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(parseOne(current));
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(parseOne(current));
  return out;
}

function parseOne(text: string): { name: string; label?: string } {
  const m = /^\s*(.+?)\s*\((.*)\)\s*$/.exec(text);
  if (!m) return { name: text.trim() };
  // Only the first parenthesis is the label: "(endgame (AOEAH gear list only))".
  return { name: m[1], label: m[2].replace(/\s*\(.*$/, "").trim() };
}

export function parseSurvey(markdown: string): {
  builds: SurveyBuild[];
  uses: Array<{ unique: string } & BuildUse>;
} {
  const section = markdown.split(/^## Builds$/m)[1]?.split(/^## /m)[0] ?? "";
  const builds: SurveyBuild[] = [];
  const uses: Array<{ unique: string } & BuildUse> = [];
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    // | # | Build | Rank | Guide (date) | Core | Optional |
    if (cells.length < 8 || !/^\d+$/.test(cells[1])) continue;
    const id = Number(cells[1]);
    const url = /https:\/\/\S+/.exec(cells[4])?.[0] ?? "";
    const date = /\((\d{4}-\d{2}-\d{2})/.exec(cells[4])?.[1] ?? "";
    builds.push({
      id,
      name: cells[2].replace(/\s*\([^)]*\)$/, ""),
      rank: cells[3],
      url,
      date,
    });
    for (const u of splitUniques(cells[5])) {
      uses.push({ unique: u.name, build: id, core: true });
    }
    for (const u of splitUniques(cells[6])) {
      uses.push({
        unique: u.name,
        build: id,
        core: false,
        ...(u.label ? { label: u.label } : {}),
      });
    }
  }
  return { builds, uses };
}

function main(argv: string[]): number {
  const { builds, uses } = parseSurvey(fs.readFileSync(SOURCE, "utf8"));
  const known = new Set(
    ITEMS.map((file) => fs.readFileSync(file, "utf8"))
      .join("\n")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((item) => item.namespace === "UNIQUE")
      .map((item) => item.name as string),
  );
  const unknown = [...new Set(uses.map((u) => u.unique))].filter(
    (name) => !known.has(name),
  );
  for (const name of unknown)
    console.error(`not a unique in items.ndjson: ${name}`);

  const uniques: Record<string, BuildUse[]> = {};
  for (const { unique, ...use } of uses) {
    if (!known.has(unique)) continue;
    (uniques[unique] ??= []).push(use);
  }
  const file: UniqueBuildsFile = {
    league: "Forbidden Rites",
    verifiedOn: "2026-11-03",
    builds,
    uniques: Object.fromEntries(
      Object.entries(uniques).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  console.log(
    `build-unique-builds: ${builds.length} builds, ${Object.keys(uniques).length} uniques, ${unknown.length} unknown names`,
  );
  if (!argv.includes("--check")) {
    fs.writeFileSync(OUT, JSON.stringify(file, null, 2) + "\n");
  }
  return unknown.length ? 1 : 0;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? "")) {
  process.exitCode = main(process.argv.slice(2));
}
