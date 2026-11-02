// Drives the real usePoeninja() load against recorded responses.
import fs from "fs";
import path from "path";
import { vi } from "vitest";
import * as snapshotRules from "@/web/background/market/snapshot.ts";
import { handleMarketRequest } from "@/web/background/market/marketFiles.ts";
import type { MarketDisk } from "@/web/background/market/marketFiles.ts";

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

/**
 * Main's /market/ route over an in-memory directory, run through the same
 * handler main uses. Other URLs go to `fallback` (the setup's public-file
 * fetch). Install with `global.fetch = route.fetch`.
 */
export function marketRoute(
  fallback: typeof fetch,
  files: Record<string, string> = {},
) {
  const disk: MarketDisk = {
    async read(file) {
      return files[file];
    },
    async replace(file, text) {
      files[file] = text;
    },
    async append(file, text) {
      files[file] = (files[file] ?? "") + text;
    },
  };
  const fetchMock = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (!href.startsWith("/market/")) return fallback(url, init);
      async function* body() {
        if (typeof init?.body === "string") yield init.body;
      }
      const res = await handleMarketRequest(
        {
          method: init?.method ?? "GET",
          url: href,
          headers: Object.fromEntries(
            Object.entries(init?.headers ?? {}).map(([k, v]) => [
              k.toLowerCase(),
              String(v),
            ]),
          ),
          body: body(),
        },
        disk,
        snapshotRules,
      );
      return response(res!.body, res!.status);
    },
  );
  const calls = (method: string) =>
    fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).startsWith("/market/") &&
        (init?.method ?? "GET") === method,
    );
  return {
    files,
    fetch: fetchMock as unknown as typeof fetch,
    fn: fetchMock,
    calls,
  };
}
