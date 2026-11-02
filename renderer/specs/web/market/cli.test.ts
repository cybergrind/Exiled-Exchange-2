import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// The real CLI entry under plain Node: proves the whole import graph is
// erasable TypeScript, without touching the network.
const CLI = path.resolve(__dirname, "../../../scripts/update-prices.ts");

function run(args: string[]) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("update-prices CLI", () => {
  it("prints usage with --help", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--if-older-than/);
    expect(r.stdout).toMatch(/--league/);
    expect(r.stdout).toMatch(/--data-dir/);
  });

  it("refuses unknown flags", () => {
    const r = run(["--bogus"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--bogus/);
  });

  it("does nothing when the snapshot is fresh", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-prices-"));
    fs.mkdirSync(path.join(dir, "market"));
    fs.writeFileSync(
      path.join(dir, "market/forbidden-rites.json"),
      JSON.stringify({
        schemaVersion: 1,
        league: "Forbidden Rites",
        writtenAt: new Date().toISOString(),
        cx: null,
        relay: null,
      }),
    );
    const r = run([
      "--data-dir",
      dir,
      "--league",
      "Forbidden Rites",
      "--if-older-than",
      "60",
    ]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/fresh/i);
  });
});
