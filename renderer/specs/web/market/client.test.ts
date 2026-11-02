import { describe, expect, it } from "vitest";
import { fetchCxWindow } from "@/web/background/market/client";
import { CX_FEED_URL, WINDOW_HOURS } from "@/web/background/market/constants";
import type { CxHour } from "@/web/background/market/types";
import { cxHour, cxHourIds, fixture } from "./prices-harness";

// Recorded hours 01:00–06:00 UTC on 2026-11-02; 07:00 answered with the
// recorded end-of-stream 404 (see specs/fixtures/market/SOURCES.md).
const HOURS = cxHourIds();
const NEWEST = HOURS[HOURS.length - 1];
const END_OF_STREAM = NEWEST + 3600;
const BASE = CX_FEED_URL;
const MINUTE = 60 * 1000;

/** 20 minutes into the hour after `hour` starts, so `hour` is the newest candidate. */
function nowFor(newestCandidate: number) {
  return (newestCandidate + 3600) * 1000 + 20 * MINUTE;
}

type Reply = { status: number; body: string } | Error;

/** fetchText backed by the fixtures; records calls and checks requests never overlap. */
function fakeFeed(
  overrides: Record<number, Reply> = {},
  fallback?: (hour: number) => Reply,
) {
  const calls: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchText = async (url: string) => {
    const match = new RegExp(`^${BASE}/(\\d+)$`).exec(url);
    if (!match) throw new Error(`unexpected url ${url}`);
    const hour = Number(match[1]);
    calls.push(hour);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    let reply: Reply | undefined = overrides[hour];
    if (!reply && fallback) reply = fallback(hour);
    if (!reply && HOURS.includes(hour))
      reply = { status: 200, body: cxHour(hour) };
    if (!reply && hour === END_OF_STREAM) {
      reply = { status: 404, body: fixture("cx-end-of-stream.json") };
    }
    if (!reply) throw new Error(`no fixture for hour ${hour}`);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fetchText, calls, maxInFlight: () => maxInFlight };
}

function cacheOf(hours: number[]) {
  return new Map<number, CxHour>(
    hours.map((hour) => [hour, JSON.parse(cxHour(hour)) as CxHour]),
  );
}

describe("fetchCxWindow", () => {
  it("steps back silently past the end-of-stream 404 at the newest hour", async () => {
    const feed = fakeFeed();
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(END_OF_STREAM),
    });
    expect(result.errors).toEqual([]);
    expect(result.hours.map((h) => h.hour)).toEqual(HOURS);
    expect(result.fetched).toEqual([...HOURS].reverse());
    expect(feed.calls).toEqual([END_OF_STREAM, ...[...HOURS].reverse()]);
    expect(result.hours[5].digest.markets.length).toBeGreaterThan(0);
    expect(feed.maxInFlight()).toBe(1);
  });

  it("does not refetch cached hours", async () => {
    const feed = fakeFeed();
    const cache = cacheOf(HOURS.slice(0, 5));
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
      cache,
    });
    expect(feed.calls).toEqual([NEWEST]);
    expect(result.fetched).toEqual([NEWEST]);
    expect(result.errors).toEqual([]);
    expect(result.hours.map((h) => h.hour)).toEqual(HOURS);
    expect(result.hours[0].digest).toBe(cache.get(HOURS[0]));
  });

  it("asks only for the unpublished hour when everything else is cached", async () => {
    const feed = fakeFeed();
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(END_OF_STREAM),
      cache: cacheOf(HOURS),
    });
    expect(feed.calls).toEqual([END_OF_STREAM]);
    expect(result.errors).toEqual([]);
    expect(result.hours.map((h) => h.hour)).toEqual(HOURS);
  });

  it.each<[string, Reply]>([
    ["network error", new Error("ECONNRESET")],
    ["5xx", { status: 503, body: "Service Unavailable" }],
    ["unparsable body", { status: 200, body: "<html>oops</html>" }],
    ["wrong shape", { status: 200, body: '{"markets":"nope"}' }],
    [
      "404 that is not the end-of-stream marker",
      { status: 404, body: "Not Found" },
    ],
  ])(
    "a failing hour (%s) is reported and keeps cached data",
    async (_, reply) => {
      const feed = fakeFeed({ [NEWEST]: reply });
      const cache = cacheOf(HOURS.slice(0, 5));
      const result = await fetchCxWindow({
        fetchText: feed.fetchText,
        baseUrl: BASE,
        nowMs: nowFor(NEWEST),
        cache,
      });
      expect(feed.calls).toEqual([NEWEST]);
      expect(result.fetched).toEqual([]);
      expect(result.errors.map((e) => e.hour)).toEqual([NEWEST]);
      expect(result.hours.map((h) => h.hour)).toEqual(HOURS.slice(0, 5));
      for (const h of result.hours) expect(h.digest).toBe(cache.get(h.hour));
      expect(cache.size).toBe(5);
    },
  );

  it("a failing hour in the middle is skipped, the rest still arrive", async () => {
    const feed = fakeFeed({ [HOURS[2]]: { status: 500, body: "" } });
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
    });
    expect(result.errors.map((e) => [e.hour, e.status])).toEqual([
      [HOURS[2], 500],
    ]);
    expect(result.hours.map((h) => h.hour)).toEqual(
      HOURS.filter((h) => h !== HOURS[2]),
    );
  });

  it("an empty markets 200 does not replace or evict cached hours", async () => {
    const empty = JSON.stringify({
      next_change_id: END_OF_STREAM,
      markets: [],
    });
    const feed = fakeFeed({ [NEWEST]: { status: 200, body: empty } });
    const cache = cacheOf(HOURS.slice(0, 5));
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
      cache,
    });
    expect(result.fetched).toEqual([]);
    expect(result.errors.map((e) => e.hour)).toEqual([NEWEST]);
    expect(result.hours.map((h) => h.hour)).toEqual(HOURS.slice(0, 5));
    for (const h of result.hours) {
      expect(h.digest).toBe(cache.get(h.hour));
      expect(h.digest.markets.length).toBeGreaterThan(0);
    }
  });

  it("an empty markets 200 is never handed back as an hour", async () => {
    const empty = JSON.stringify({
      next_change_id: HOURS[3] + 3600,
      markets: [],
    });
    const feed = fakeFeed({ [HOURS[3]]: { status: 200, body: empty } });
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
    });
    expect(result.hours.map((h) => h.hour)).not.toContain(HOURS[3]);
    expect(result.fetched).not.toContain(HOURS[3]);
    expect(result.errors.map((e) => e.hour)).toEqual([HOURS[3]]);
  });

  it("never returns more than the window, ascending", async () => {
    const feed = fakeFeed();
    const small = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(END_OF_STREAM),
      window: 3,
    });
    expect(small.hours.map((h) => h.hour)).toEqual(HOURS.slice(3));
    expect(feed.calls).toEqual([END_OF_STREAM, HOURS[5], HOURS[4], HOURS[3]]);

    const older = HOURS[0] - 3600;
    const cache = cacheOf(HOURS);
    cache.set(older, JSON.parse(cxHour(HOURS[0])) as CxHour);
    const full = await fetchCxWindow({
      fetchText: fakeFeed().fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
      cache,
    });
    expect(full.hours).toHaveLength(WINDOW_HOURS);
    expect(full.hours.map((h) => h.hour)).toEqual(HOURS);
  });

  it.each<[string, (hour: number) => Reply]>([
    ["rejects", () => new Error("offline")],
    ["answers 500", () => ({ status: 500, body: "" })],
    [
      "answers end-of-stream",
      (hour) => ({
        status: 404,
        body: JSON.stringify({ next_change_id: hour, markets: [] }),
      }),
    ],
  ])("bounds the request count when every request %s", async (_, reply) => {
    const feed = fakeFeed({}, reply);
    const result = await fetchCxWindow({
      fetchText: feed.fetchText,
      baseUrl: BASE,
      nowMs: nowFor(NEWEST),
    });
    expect(feed.calls.length).toBeGreaterThan(0);
    expect(feed.calls.length).toBeLessThanOrEqual(WINDOW_HOURS + 2);
    expect(new Set(feed.calls).size).toBe(feed.calls.length);
    expect(result.hours).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(feed.maxInFlight()).toBe(1);
  });
});
