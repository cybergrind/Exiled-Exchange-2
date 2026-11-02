// Drives the real usePoeninja() load against recorded responses.
import fs from "fs";
import path from "path";
import { vi } from "vitest";

const FIXTURES = path.resolve(__dirname, "../../fixtures/market");
const PUBLIC = path.resolve(__dirname, "../../../public");

export function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

export function cxHourIds(): number[] {
  return fs
    .readdirSync(path.join(FIXTURES, "cx-hours"))
    .map((name) => Number(name.replace(".json", "")))
    .sort((a, b) => a - b);
}

export function cxHour(id: number): string {
  return fixture(`cx-hours/${id}.json`);
}

function response(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

/** Routes proxied URLs to fixtures; records every call. */
export function fakeProxy(overrides: Record<string, () => unknown> = {}) {
  // `init` is part of the signature so tests can read it from mock.calls.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (url: string, init?: RequestInit) => {
    for (const [prefix, make] of Object.entries(overrides)) {
      if (url.startsWith(prefix)) return make();
    }
    if (url.endsWith("/data/item-drop.json")) {
      return response(
        fs.readFileSync(path.join(PUBLIC, "data/item-drop.json"), "utf8"),
      );
    }
    if (url.endsWith("/data/namespaceMap.json")) {
      return response(fixture("relay-namespace-map.json"));
    }
    if (url.endsWith("/overviewData.json")) {
      return response(fixture("relay-overview-forbidden-rites.json"));
    }
    const hour = /currency-exchange\/poe2\/(\d+)$/.exec(url);
    if (hour) {
      const id = Number(hour[1]);
      if (cxHourIds().includes(id)) return response(cxHour(id));
      return response(fixture("cx-end-of-stream.json"), 404);
    }
    return response("not found", 404);
  });
}

export { response };
