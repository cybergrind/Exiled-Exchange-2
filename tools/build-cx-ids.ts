// WP-10 · Item id map.
//
// Builds renderer/public/data/poe-source/cx-ids.json: GGG metadata id -> the app's
// item refName and namespace, so currency-exchange data (keyed by metadata id) can be
// joined to items.ndjson. Icon file names are NOT ids: the Etcher's icon is
// CurrencyWeaponMagicQuality, its id is Metadata/Items/Currency/CurrencyMagicQuality.
//
// Run with plain Node (type stripping, no compiler):
//   node tools/build-cx-ids.ts                       download base_items.json once
//   node tools/build-cx-ids.ts --save-raw <file>     ...and keep the download
//   node tools/build-cx-ids.ts --from <file>         use a saved copy, no network
//
// Scope: only ids whose item_class occurs among the ids traded in the recorded
// Forbidden Rites hours (renderer/specs/fixtures/market/cx-ids-forbidden-rites.json),
// and whose name is an ITEM or GEM refName in items.ndjson ("[DNT]" placeholders
// excluded). Every fixture id must map, or the script exits non-zero.
//
// Collisions (several ids, one name) are kept: id -> name stays unambiguous, which is
// the direction exchange data needs. They are printed and listed under "collisions"
// in the output so a reverse lookup (name -> id) can see it is not unique. On
// 2026-11-02 there were two, each a released twin of a traded id: Orb of Extraction
// (...ExtractAllSocketablesBench / ...Currency) and Uncut Skill Gem (Level 1)
// (SkillGemUncut1 / SkillGemUncutQuest1).

import fs from "node:fs";
import path from "node:path";

const SOURCE = "https://repoe-fork.github.io/poe2/base_items.json";
const USER_AGENT = "Exiled-Exchange-2-fork (cx-ids generator)";

const ROOT = path.resolve(import.meta.dirname, "..");
const ITEMS_FILE = path.join(ROOT, "renderer/public/data/en/items.ndjson");
const FIXTURE_FILE = path.join(ROOT, "renderer/specs/fixtures/market/cx-ids-forbidden-rites.json");
const OUT_FILE = path.join(ROOT, "renderer/public/data/poe-source/cx-ids.json");

type Ns = "ITEM" | "GEM";

interface BaseItem {
  name?: string;
  item_class?: string;
}

interface Entry {
  name: string;
  ns: Ns;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadBaseItems(): Promise<Record<string, BaseItem>> {
  const from = argValue("--from");
  let text: string;
  if (from) {
    text = fs.readFileSync(from, "utf8");
  } else {
    const res = await fetch(SOURCE, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
    text = await res.text();
    const saveRaw = argValue("--save-raw");
    if (saveRaw) fs.writeFileSync(saveRaw, text);
  }
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("base_items.json: expected an object keyed by metadata id");
  }
  return data as Record<string, BaseItem>;
}

// refName -> namespaces it appears under (ITEM and GEM only).
function loadAppNames(): Map<string, Set<Ns>> {
  const names = new Map<string, Set<Ns>>();
  for (const line of fs.readFileSync(ITEMS_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line) as { refName?: string; namespace?: string };
    if (!item.refName) continue;
    if (item.namespace !== "ITEM" && item.namespace !== "GEM") continue;
    let set = names.get(item.refName);
    if (!set) names.set(item.refName, (set = new Set()));
    set.add(item.namespace);
  }
  return names;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function main(): Promise<void> {
  const baseItems = await loadBaseItems();
  const appNames = loadAppNames();
  const fixtureIds = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8")) as string[];

  const classes = new Set<string>();
  const missingFromSource: string[] = [];
  for (const id of fixtureIds) {
    const cls = baseItems[id]?.item_class;
    if (cls) classes.add(cls);
    else missingFromSource.push(id);
  }

  const ids: Record<string, Entry> = {};
  const ambiguousNs: string[] = [];
  for (const id of Object.keys(baseItems).sort(compare)) {
    const base = baseItems[id];
    if (!base.item_class || !classes.has(base.item_class) || !base.name) continue;
    // "[DNT] ..." are GGG placeholders (several ids share "[DNT] Not Shown To Players");
    // items.ndjson carries them too, but they are not tradeable items.
    if (base.name.startsWith("[DNT]")) continue;
    const nss = appNames.get(base.name);
    if (!nss) continue;
    if (nss.size > 1) {
      ambiguousNs.push(`${id} (${base.name}: ${[...nss].join(", ")})`);
      continue;
    }
    ids[id] = { name: base.name, ns: [...nss][0] };
  }

  const byName = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(ids)) {
    const key = `${entry.ns}::${entry.name}`;
    byName.set(key, [...(byName.get(key) ?? []), id]);
  }
  const collisions: Record<string, string[]> = {};
  for (const [key, list] of [...byName].sort((a, b) => compare(a[0], b[0]))) {
    if (list.length > 1) collisions[key] = list;
  }

  const unmapped = fixtureIds.filter((id) => !ids[id]);

  const lines = [
    "{",
    `"source": ${JSON.stringify(SOURCE)},`,
    `"generatedOn": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`,
    `"classes": ${JSON.stringify([...classes].sort(compare))},`,
    `"collisions": {`,
    Object.entries(collisions)
      .map(([key, list]) => `${JSON.stringify(key)}: ${JSON.stringify(list)}`)
      .join(",\n"),
    "},",
    `"ids": {`,
    Object.entries(ids)
      .map(([id, entry]) => `${JSON.stringify(id)}: ${JSON.stringify(entry)}`)
      .join(",\n"),
    "}",
    "}",
    "",
  ];
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, lines.join("\n"));

  console.log(`source items: ${Object.keys(baseItems).length}`);
  console.log(`classes (${classes.size}): ${[...classes].sort(compare).join(", ")}`);
  console.log(`mapped ids: ${Object.keys(ids).length}`);
  console.log(`fixture ids mapped: ${fixtureIds.length - unmapped.length} of ${fixtureIds.length}`);
  console.log(`collisions (one name, several ids): ${Object.keys(collisions).length}`);
  for (const [key, list] of Object.entries(collisions)) console.log(`  ${key}: ${list.join(" ")}`);
  if (ambiguousNs.length) {
    console.log(`skipped, name is both ITEM and GEM: ${ambiguousNs.length}`);
    for (const line of ambiguousNs) console.log(`  ${line}`);
  }
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)} (${fs.statSync(OUT_FILE).size} bytes)`);

  if (missingFromSource.length || unmapped.length) {
    for (const id of missingFromSource) console.error(`not in source: ${id}`);
    for (const id of unmapped) {
      if (!missingFromSource.includes(id)) console.error(`unmapped: ${id} (${baseItems[id]?.name})`);
    }
    process.exitCode = 1;
  }
}

await main();
