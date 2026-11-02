import { afterEach, describe, expect, it, vi } from "vitest";

// WP-31: the chart reads the league's history once and keeps it a while.
const LINE = '{"v":1,"hour":3600,"pairs":{}}\n{"v":1,"hour":7200,"pairs":{}}\n';
const NOW = 1_800_000_000_000;

function stubFetch(status = 200) {
  const fetch = vi.fn(async () => new Response(LINE, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function fresh() {
  vi.resetModules();
  const { useMarketHistory } = await import(
    "@/web/background/marketHistory.ts"
  );
  return useMarketHistory();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMarketHistory", () => {
  it("reads the league's history", async () => {
    const fetch = stubFetch();
    const history = await fresh();
    await history.ensure("Forbidden Rites", NOW);
    expect(fetch).toHaveBeenCalledWith("/market/forbidden-rites.history", {
      cache: "no-store",
    });
    expect(history.points.value).toHaveLength(2);
    expect(history.league.value).toBe("Forbidden Rites");
  });

  it("reads it again only after ten minutes or for another league", async () => {
    const fetch = stubFetch();
    const history = await fresh();
    await history.ensure("Forbidden Rites", NOW);
    await history.ensure("Forbidden Rites", NOW + 9 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await history.ensure("Forbidden Rites", NOW + 11 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await history.ensure("Standard", NOW + 11 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(history.league.value).toBe("Standard");
  });

  it("is empty when the league has no history", async () => {
    stubFetch(404);
    const history = await fresh();
    await history.ensure("Forbidden Rites", NOW);
    expect(history.points.value).toEqual([]);
  });

  it("keeps the newer league when an older read answers last", async () => {
    let answerOld!: (r: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (answerOld = resolve)),
      )
      .mockImplementationOnce(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const history = await fresh();
    const old = history.ensure("Forbidden Rites", NOW);
    await history.ensure("Standard", NOW);
    answerOld(new Response(LINE, { status: 200 }));
    await old;
    expect(history.league.value).toBe("Standard");
    expect(history.points.value).toEqual([]);
  });

  it("reads once when asked twice at the same time", async () => {
    const fetch = stubFetch();
    const history = await fresh();
    await Promise.all([
      history.ensure("Forbidden Rites", NOW),
      history.ensure("Forbidden Rites", NOW),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
