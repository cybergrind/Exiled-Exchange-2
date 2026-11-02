import { describe, expect, it, vi } from "vitest";
import { updateSnapshot } from "@/web/background/market/update.ts";
import type { HttpGet, SnapshotStore } from "@/web/background/market/update.ts";
import { parseSnapshot } from "@/web/background/market/snapshot.ts";
import { cxHour, cxHourIds, fixture } from "./prices-harness";

const NEWEST = cxHourIds().at(-1)!;
// One minute into the hour after the newest recording: its successor is the
// end of stream, so the window is exactly the six recorded hours.
const NOW = (NEWEST + 2 * 3600 + 60) * 1000;
const ETCHER = "Metadata/Items/Currency/CurrencyMagicQuality";

function memoryStore(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const store: SnapshotStore = {
    read: async (name) => files.get(name),
    write: async (name, text) => {
      files.set(name, text);
    },
    list: async (dir) =>
      [...files.keys()]
        .filter((name) => name.startsWith(`${dir}/`))
        .map((name) => name.slice(dir.length + 1)),
    remove: async (name) => {
      files.delete(name);
    },
  };
  return { store, files };
}

type Route = (
  url: string,
  headers: Record<string, string>,
) => { status: number; body: string; headers?: Record<string, string> };

function fakeHttp(overrides: Record<string, Route> = {}) {
  return vi.fn<HttpGet>(async (url, headers = {}) => {
    for (const [prefix, route] of Object.entries(overrides)) {
      if (url.startsWith(prefix)) {
        const r = route(url, headers);
        return { headers: {}, ...r };
      }
    }
    if (url.includes("/api/trade2/data/leagues")) {
      return { status: 200, body: fixture("trade2-leagues.json"), headers: {} };
    }
    if (url.endsWith("/overviewData.json")) {
      if (headers["If-None-Match"] === '"relay-v1"') {
        return { status: 304, body: "", headers: { etag: '"relay-v1"' } };
      }
      return {
        status: 200,
        body: fixture("relay-overview-forbidden-rites.json"),
        headers: { etag: '"relay-v1"' },
      };
    }
    const hour = /currency-exchange\/poe2\/(\d+)$/.exec(url);
    if (hour) {
      const id = Number(hour[1]);
      if (cxHourIds().includes(id)) {
        return { status: 200, body: cxHour(id), headers: {} };
      }
      return {
        status: 404,
        body: fixture("cx-end-of-stream.json"),
        headers: {},
      };
    }
    return { status: 404, body: "not found", headers: {} };
  });
}

const log = () => undefined;

describe("updateSnapshot", () => {
  it("writes the league's snapshot from the feed and the relay", async () => {
    const { store, files } = memoryStore();
    const http = fakeHttp();
    const result = await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http,
      store,
      log,
    });

    expect(result.status).toBe("written");
    const snap = parseSnapshot(files.get("forbidden-rites.json")!);
    expect(snap.league).toBe("Forbidden Rites");
    expect(snap.cx!.asOfHour).toBe(NEWEST);
    expect(snap.cx!.hours).toEqual(cxHourIds());
    expect(snap.cx!.pairs[ETCHER].exalted!.typical).toBeCloseTo(4.908, 3);
    expect(snap.relay!.etag).toBe('"relay-v1"');
    expect(JSON.stringify(snap.relay!.overview)).toContain("Arcanist's Etcher");
    // The relay is asked by league name, as the app asks it.
    expect(
      http.mock.calls.some(([url]) =>
        url.endsWith("/proxy/Forbidden%20Rites/overviewData.json"),
      ),
    ).toBe(true);
  });

  it("keeps fetched hours and does not ask for them again", async () => {
    const { store, files } = memoryStore();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http: fakeHttp(),
      store,
      log,
    });
    expect(
      [...files.keys()].filter((name) => name.startsWith("cx-hours/")),
    ).toHaveLength(cxHourIds().length);

    const http = fakeHttp();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http,
      store,
      log,
    });
    const hourCalls = http.mock.calls.filter(([url]) =>
      /currency-exchange\/poe2\/\d+$/.test(url),
    );
    expect(
      hourCalls.map(([url]) => Number(url.split("/").at(-1))),
    ).not.toContain(NEWEST);
  });

  it("revalidates the relay with its ETag and keeps the overview on 304", async () => {
    const { store, files } = memoryStore();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http: fakeHttp(),
      store,
      log,
    });
    const http = fakeHttp();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW + 60_000,
      http,
      store,
      log,
    });
    const relayCall = http.mock.calls.find(([url]) =>
      url.endsWith("/overviewData.json"),
    )!;
    expect(relayCall[1]?.["If-None-Match"]).toBe('"relay-v1"');
    const snap = parseSnapshot(files.get("forbidden-rites.json")!);
    expect(JSON.stringify(snap.relay!.overview)).toContain("Arcanist's Etcher");
  });

  it("fails and keeps the previous snapshot when nothing new arrives", async () => {
    const { store, files } = memoryStore();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http: fakeHttp(),
      store,
      log,
    });
    const before = files.get("forbidden-rites.json");

    const down: Route = () => {
      throw new Error("offline");
    };
    await expect(
      updateSnapshot({
        league: "Forbidden Rites",
        nowMs: NOW + 3 * 3600_000,
        http: fakeHttp({ "https://": down }),
        store,
        log,
      }),
    ).rejects.toThrow(/nothing/i);
    expect(files.get("forbidden-rites.json")).toBe(before);
  });

  it("writes what it has when only one source answers", async () => {
    const { store, files } = memoryStore();
    const relayDown: Route = () => ({ status: 503, body: "" });
    const messages: string[] = [];
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http: fakeHttp({ "https://api.exiledexchange2.dev": relayDown }),
      store,
      log: (m) => messages.push(m),
    });
    const snap = parseSnapshot(files.get("forbidden-rites.json")!);
    expect(snap.cx!.pairs[ETCHER]).toBeDefined();
    expect(snap.relay).toBeNull();
    expect(messages.join("\n")).toMatch(/relay.*503/i);
  });

  it("notes when the league is not the current one", async () => {
    const { store } = memoryStore();
    const result = await updateSnapshot({
      league: "Runes of Aldur",
      nowMs: NOW,
      http: fakeHttp(),
      store,
      log,
    });
    expect(result.notices.join("\n")).toMatch(
      /Runes of Aldur.*not the current league.*Forbidden Rites/,
    );
  });

  it("skips the fetch when the snapshot is newer than --if-older-than", async () => {
    const { store } = memoryStore();
    await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW,
      http: fakeHttp(),
      store,
      log,
    });
    const http = fakeHttp();
    const result = await updateSnapshot({
      league: "Forbidden Rites",
      nowMs: NOW + 59 * 60_000,
      ifOlderThanMinutes: 60,
      http,
      store,
      log,
    });
    expect(result.status).toBe("fresh");
    expect(http).not.toHaveBeenCalled();
  });
});
