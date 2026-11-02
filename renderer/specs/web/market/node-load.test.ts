import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// Everything in market/ is also run by plain Node (make update-prices, ./run),
// without a compiler: erasable syntax only, relative imports with .ts extensions.
const MARKET_DIR = path.resolve(
  __dirname,
  "../../../src/web/background/market",
);

function marketModules() {
  if (!fs.existsSync(MARKET_DIR)) return [];
  return fs
    .readdirSync(MARKET_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));
}

describe("market modules under plain Node", () => {
  it("exist", () => {
    expect(marketModules().length).toBeGreaterThan(0);
  });

  it.each(marketModules())("%s loads without a compiler", (name) => {
    const url = new URL(`file://${path.join(MARKET_DIR, name)}`).href;
    const out = execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(url)}); console.log("ok")`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(out.trim()).toBe("ok");
  });

  it.each(marketModules())("%s imports nothing from vue or @/", (name) => {
    const source = fs.readFileSync(path.join(MARKET_DIR, name), "utf8");
    expect(source).not.toMatch(/from\s+["'](vue|@\/[^"']*)["']/);
  });
});
