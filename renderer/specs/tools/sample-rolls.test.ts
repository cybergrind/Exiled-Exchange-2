import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  assertNoAccountData,
  BAND_FRACTION,
  buildSearchQuery,
  Pacer,
  parseRange,
  PILOT,
  planUnits,
  rollBands,
  runSampler,
  statIndexFromNdjson,
  USER_AGENT,
} from "../../../tools/sample-rolls.ts";
import type {
  Clock,
  HttpInit,
  HttpResponse,
  NinjaLine,
} from "../../../tools/sample-rolls.ts";

// WP-61 · Roll sampler, offline only. Nothing here touches the network: every
// HTTP call goes to a fake.

const DATA = path.resolve(__dirname, "../../public/data/en");
const STATS = statIndexFromNdjson(
  fs.readFileSync(path.join(DATA, "stats.ndjson"), "utf8"),
);
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/market/stash-unique-armours.json",
);
const LINES = (
  JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as { lines: NinjaLine[] }
).lines;
const CLI = path.resolve(__dirname, "../../../tools/sample-rolls.ts");

const SVALINN = { name: "Svalinn", baseType: "Crucible Tower Shield" };
const TEMPORALIS = { name: "Temporalis", baseType: "Silk Robe" };

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sample-rolls-"));
}

// ---------------------------------------------------------------- fakes

class FakeClock implements Clock {
  t = Date.parse("2026-11-02T12:00:00Z");
  slept: number[] = [];
  now() {
    return this.t;
  }

  async sleep(ms: number) {
    this.slept.push(ms);
    this.t += ms;
  }
}

function headers(h: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function response(
  status: number,
  body: unknown,
  h: Record<string, string> = {},
): HttpResponse {
  return { status, headers: headers(h), json: async () => body };
}

interface Rule {
  max: number;
  period: number;
  restrict: number;
}

/** A GGG-like server: enforces its rules per policy and reports state headers. */
class FakeTrade {
  hits: Record<string, number[]> = { search: [], fetch: [] };
  restrictedUntil: Record<string, number> = { search: 0, fetch: 0 };
  violations = 0;
  calls: Array<{ url: string; init: HttpInit; at: number }> = [];
  listings: (ids: string[]) => unknown[] = (ids) => ids.map(listing);
  total = 25;
  failAfter = Infinity;

  constructor(
    public clock: FakeClock,
    public rules: Rule[] = [
      { max: 5, period: 10, restrict: 60 },
      { max: 15, period: 60, restrict: 300 },
    ],
  ) {}

  http = async (url: string, init: HttpInit): Promise<HttpResponse> => {
    const now = this.clock.now();
    this.calls.push({ url, init, at: now });
    if (this.calls.length > this.failAfter) throw new Error("ECONNRESET");
    // Search and fetch are separate GGG policies with their own counters.
    const kind = url.includes("/fetch/") ? "fetch" : "search";
    const hits = this.hits[kind];
    hits.push(now);
    const state = this.rules.map((r) => {
      const n = hits.filter((t) => t > now - r.period * 1000).length;
      return { r, n };
    });
    const over = state.find(({ r, n }) => n > r.max);
    if (over || now < this.restrictedUntil[kind]) {
      this.violations++;
      if (over) {
        this.restrictedUntil[kind] = now + over.r.restrict * 1000;
      }
      const left = Math.ceil((this.restrictedUntil[kind] - now) / 1000);
      return response(
        429,
        { error: { code: 3, message: "Rate limit" } },
        {
          "Retry-After": String(left),
          ...this.rateHeaders(state, left),
        },
      );
    }
    const h = this.rateHeaders(state, 0);
    if (kind === "search") {
      const n = Math.min(this.total, 100);
      return response(
        200,
        {
          id: "QueryId42",
          result: Array.from({ length: n }, (_, i) => `listing-id-${i}`),
          total: this.total,
        },
        h,
      );
    }
    const ids = url.split("/fetch/")[1].split("?")[0].split(",");
    return response(200, { result: this.listings(ids) }, h);
  };

  rateHeaders(state: Array<{ r: Rule; n: number }>, restricted: number) {
    return {
      "X-Rate-Limit-Policy": "trade-search-request-limit",
      "X-Rate-Limit-Rules": "Ip",
      "X-Rate-Limit-Ip": state
        .map(({ r }) => `${r.max}:${r.period}:${r.restrict}`)
        .join(","),
      "X-Rate-Limit-Ip-State": state
        .map(({ r, n }) => `${n}:${r.period}:${restricted}`)
        .join(","),
    };
  }
}

function listing(id: string, i = 0) {
  return {
    id,
    listing: {
      method: "psapi",
      indexed: "2026-11-02T11:00:00Z",
      stash: { name: "~price 1 divine", x: 1, y: 2 },
      whisper:
        "@SecretCharName Hi, I would like to buy your Svalinn listed for 2 divine in Forbidden Rites",
      whisper_token: "secret-whisper-token",
      account: {
        name: "SecretAccount#1234",
        lastCharacterName: "SecretCharName",
        online: { league: "Forbidden Rites" },
        realm: "poe2",
      },
      price: { type: "~price", amount: 2 + i, currency: "divine" },
    },
    item: { name: "Svalinn", typeLine: "Crucible Tower Shield" },
  };
}

// ---------------------------------------------------------------- planning

describe("parseRange", () => {
  it("reads one (lo-hi) range and strips ninja markup", () => {
    expect(
      parseRange("+(100-150) to maximum [EnergyShield|Energy Shield]"),
    ).toEqual({ lo: 100, hi: 150, text: "+# to maximum Energy Shield" });
    expect(
      parseRange("(5-30)% of Damage taken [Recoup|Recouped] as Life"),
    ).toEqual({ lo: 5, hi: 30, text: "#% of Damage taken Recouped as Life" });
  });

  it("refuses ranges it cannot place on the trade site", () => {
    expect(
      parseRange("Skills have -(2-1.9) seconds to Cooldown"),
    ).toMatchObject({ skip: expect.stringMatching(/negative/) });
    expect(parseRange("Adds (5-10) to (15-20) Fire Damage")).toMatchObject({
      skip: expect.stringMatching(/ranges/),
    });
    expect(
      parseRange("Chance to [Block] [Hit|Damage] is [Lucky]"),
    ).toMatchObject({ skip: expect.stringMatching(/no range/) });
  });
});

describe("rollBands", () => {
  it("uses a named band fraction", () => {
    expect(BAND_FRACTION).toBeCloseTo(1 / 3);
  });

  it.each([
    [100, 150, { min: 100, max: 116 }, { min: 134, max: 150 }],
    [2, 20, { min: 2, max: 8 }, { min: 14, max: 20 }],
    [1, 2, { min: 1, max: 1 }, { min: 2, max: 2 }],
    [1.04, 2, { min: 1.04, max: 1.36 }, { min: 1.68, max: 2 }],
  ])("%s-%s gives a low and a high band", (lo, hi, low, high) => {
    expect(rollBands(lo, hi)).toEqual({ low, high });
  });
});

describe("planUnits", () => {
  it("builds band units for the variable mods of a line", () => {
    const { units, skipped } = planUnits(LINES, [SVALINN], STATS);
    expect([...new Set(units.map((u) => u.statRef))]).toEqual([
      "# to maximum Runic Ward",
      "#% increased Armour",
      "You take #% of damage from Blocked Hits",
    ]);
    expect(units).toHaveLength(6);
    expect(units.map((u) => u.band)).toEqual([
      "low",
      "high",
      "low",
      "high",
      "low",
      "high",
    ]);
    expect(units[0]).toMatchObject({
      slug: "svalinn-crucible-tower-shield",
      unique: "Svalinn",
      baseType: "Crucible Tower Shield",
      range: { lo: 50, hi: 100 },
      filter: { min: 50, max: 66 },
    });
    expect(skipped).toEqual([
      expect.objectContaining({ text: expect.stringMatching(/Lucky/) }),
    ]);
  });

  it("reports the cooldown mod of Temporalis as skipped, not guessed", () => {
    const { units, skipped } = planUnits(LINES, [TEMPORALIS], STATS);
    expect(new Set(units.map((u) => u.statRef)).size).toBe(4);
    expect(skipped.map((s) => s.reason).join()).toMatch(/negative/);
  });

  it("caps rolls per item", () => {
    const { units } = planUnits(LINES, [TEMPORALIS], STATS, { maxRolls: 2 });
    expect(new Set(units.map((u) => u.statRef)).size).toBe(2);
  });

  it("skips an item with fewer than 2 variable rolls as not Tier A", () => {
    const line: NinjaLine = {
      name: "Svalinn",
      baseType: "Crucible Tower Shield",
      explicitModifiers: [{ text: "(200-300)% increased [Armour|Armour]" }],
    };
    const { units, skipped } = planUnits([line], [SVALINN], STATS);
    expect(units).toEqual([]);
    expect(skipped[0].reason).toMatch(/2 variable/);
  });

  it("reports a pilot item missing from the lines", () => {
    const { skipped } = planUnits(
      LINES,
      [{ name: "Nope", baseType: "X" }],
      STATS,
    );
    expect(skipped[0].reason).toMatch(/not in the lines/);
  });
});

describe("PILOT", () => {
  it("holds 5 uniques the app knows", () => {
    const items = fs.readFileSync(path.join(DATA, "items.ndjson"), "utf8");
    expect(PILOT).toHaveLength(5);
    for (const p of PILOT) {
      expect(items).toContain(
        `"name": "${p.name}", "refName": "${p.name}", "namespace": "UNIQUE", "unique": {"base": "${p.baseType}"}`,
      );
    }
  });
});

describe("buildSearchQuery", () => {
  const unit = (statRef: string, band: "low" | "high" = "low") =>
    planUnits(LINES, [SVALINN], STATS).units.find(
      (u) => u.statRef === statRef && u.band === band,
    )!;

  it("has the trade2 search shape", () => {
    const q = buildSearchQuery(unit("You take #% of damage from Blocked Hits"));
    expect(q).toEqual({
      query: {
        status: { option: "online" },
        name: "Svalinn",
        type: "Crucible Tower Shield",
        stats: [
          {
            type: "and",
            filters: [
              { id: "explicit.stat_2905515354", value: { min: 2, max: 8 } },
            ],
          },
        ],
        filters: {
          misc_filters: { filters: { corrupted: { option: "false" } } },
        },
      },
      sort: { price: "asc" },
    });
  });

  it("uses a count group when the stat has several explicit trade ids", () => {
    const q = buildSearchQuery(unit("#% increased Armour", "high"));
    expect(q.query.stats).toEqual([
      {
        type: "count",
        value: { min: 1 },
        filters: [
          { id: "explicit.stat_1062208444", value: { min: 267, max: 300 } },
          { id: "explicit.stat_2866361420", value: { min: 267, max: 300 } },
        ],
      },
    ]);
  });

  it("negates and swaps the bounds of an inverted trade stat", () => {
    const q = buildSearchQuery({
      ...unit("#% increased Armour"),
      tradeIds: ["explicit.stat_1"],
      inverted: true,
      filter: { min: 10, max: 20 },
    });
    expect(q.query.stats[0].filters[0].value).toEqual({ min: -20, max: -10 });
  });
});

// ---------------------------------------------------------------- pacing

describe("Pacer", () => {
  it("never exceeds the server's rules over a long run", async () => {
    const clock = new FakeClock();
    const server = new FakeTrade(clock);
    const pacer = new Pacer(clock);
    for (let i = 0; i < 40; i++) {
      await pacer.wait();
      const res = await server.http("https://x/api/trade2/search/L", {
        method: "POST",
        headers: {},
      });
      pacer.update(res.status, res.headers);
    }
    expect(server.violations).toBe(0);
    // 40 requests under 15 per 60 s cannot take less than two minutes.
    expect(clock.t - server.calls[0].at).toBeGreaterThan(120_000);
  });

  it("waits out Retry-After", async () => {
    const clock = new FakeClock();
    const pacer = new Pacer(clock);
    await pacer.wait();
    pacer.update(429, headers({ "Retry-After": "30" }));
    const before = clock.t;
    await pacer.wait();
    expect(clock.t - before).toBeGreaterThanOrEqual(30_000);
  });

  it("waits out an active restriction in the state header", async () => {
    const clock = new FakeClock();
    const pacer = new Pacer(clock);
    await pacer.wait();
    pacer.update(
      200,
      headers({
        "X-Rate-Limit-Rules": "Ip",
        "X-Rate-Limit-Ip": "5:10:60",
        "X-Rate-Limit-Ip-State": "6:10:45",
      }),
    );
    const before = clock.t;
    await pacer.wait();
    expect(clock.t - before).toBeGreaterThanOrEqual(45_000);
  });

  it("counts hits it did not send (other traffic from this IP)", async () => {
    const clock = new FakeClock();
    const pacer = new Pacer(clock);
    await pacer.wait();
    pacer.update(
      200,
      headers({
        "X-Rate-Limit-Rules": "Ip",
        "X-Rate-Limit-Ip": "5:10:60",
        "X-Rate-Limit-Ip-State": "5:10:0",
      }),
    );
    const before = clock.t;
    await pacer.wait();
    expect(clock.t - before).toBeGreaterThanOrEqual(10_000);
  });

  it("is conservative before it has seen any rules", async () => {
    const clock = new FakeClock();
    const pacer = new Pacer(clock);
    await pacer.wait();
    const before = clock.t;
    await pacer.wait();
    expect(clock.t - before).toBeGreaterThanOrEqual(5_000);
  });
});

// ---------------------------------------------------------------- runs

describe("runSampler", () => {
  function setup() {
    const dir = tmpDir();
    const clock = new FakeClock();
    const server = new FakeTrade(clock);
    const { units } = planUnits(LINES, [SVALINN], STATS);
    return { dir, clock, server, units };
  }

  function opts(s: ReturnType<typeof setup>, server = s.server) {
    return {
      units: s.units,
      league: "Forbidden Rites",
      http: server.http,
      clock: s.clock,
      outDir: s.dir,
      statePath: path.join(s.dir, "_state.json"),
      log: () => {},
    };
  }

  it("records count and cheapest prices per band, with timestamps", async () => {
    const s = setup();
    await runSampler(opts(s));
    const out = JSON.parse(
      fs.readFileSync(
        path.join(s.dir, "svalinn-crucible-tower-shield.json"),
        "utf8",
      ),
    );
    expect(out).toMatchObject({
      schemaVersion: 1,
      league: "Forbidden Rites",
      unique: "Svalinn",
      baseType: "Crucible Tower Shield",
      bandFraction: BAND_FRACTION,
    });
    expect(out.samples).toHaveLength(6);
    expect(out.samples[0]).toMatchObject({
      statRef: "# to maximum Runic Ward",
      band: "low",
      range: { lo: 50, hi: 100 },
      filter: { min: 50, max: 66 },
      total: 25,
      sampledAt: "2026-11-02T12:00:00.000Z",
    });
    expect(out.samples[0].cheapest).toHaveLength(10);
    expect(out.samples[0].cheapest[0]).toEqual({
      amount: 2,
      currency: "divine",
    });
    expect(s.server.violations).toBe(0);
  });

  it("sends exactly the sampler's User-Agent and nothing identifying", async () => {
    const s = setup();
    await runSampler(opts(s));
    expect(USER_AGENT).toBe("Exiled-Exchange-2 (roll sampler)");
    for (const call of s.server.calls) {
      expect(call.init.headers["User-Agent"]).toBe(USER_AGENT);
      expect(
        Object.keys(call.init.headers).map((h) => h.toLowerCase()),
      ).not.toContain("cookie");
    }
  });

  it("stores no account names, character names, whispers or ids", async () => {
    const s = setup();
    await runSampler(opts(s));
    const text = fs.readFileSync(
      path.join(s.dir, "svalinn-crucible-tower-shield.json"),
      "utf8",
    );
    for (const secret of [
      "SecretAccount",
      "SecretCharName",
      "would like to buy",
      "secret-whisper-token",
      "listing-id-",
      "QueryId42",
      "account",
      "whisper",
      "stash",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("skips the fetch when a band has no listings", async () => {
    const s = setup();
    s.server.total = 0;
    await runSampler(opts(s));
    expect(s.server.calls.every((c) => !c.url.includes("/fetch/"))).toBe(true);
  });

  it("resumes an interrupted run without repeating finished units", async () => {
    const s = setup();
    const broken = new FakeTrade(s.clock);
    broken.failAfter = 4; // 2 units of search + fetch, then the network dies
    await expect(runSampler(opts(s, broken))).rejects.toThrow(/stopped/i);
    const state = JSON.parse(
      fs.readFileSync(path.join(s.dir, "_state.json"), "utf8"),
    );
    expect(state.done).toHaveLength(2);

    const fresh = new FakeTrade(s.clock);
    await runSampler(opts(s, fresh));
    const searches = fresh.calls.filter((c) => c.url.includes("/search/"));
    expect(searches).toHaveLength(4);
    const out = JSON.parse(
      fs.readFileSync(
        path.join(s.dir, "svalinn-crucible-tower-shield.json"),
        "utf8",
      ),
    );
    expect(out.samples).toHaveLength(6);

    const again = new FakeTrade(s.clock);
    await runSampler(opts(s, again));
    expect(again.calls).toHaveLength(0);
  });

  it("retries a 429 after waiting, and still finishes", async () => {
    const s = setup();
    let first = true;
    const flaky = async (url: string, init: HttpInit) => {
      if (first) {
        first = false;
        return response(429, {}, { "Retry-After": "20" });
      }
      return s.server.http(url, init);
    };
    const start = s.clock.t;
    await runSampler({ ...opts(s), http: flaky });
    expect(s.clock.slept.some((ms) => ms >= 20_000)).toBe(true);
    expect(s.clock.t - start).toBeGreaterThanOrEqual(20_000);
  });

  it("stops on a 4xx it does not understand instead of hammering", async () => {
    const s = setup();
    let calls = 0;
    const bad = async () => {
      calls++;
      return response(400, { error: { code: 2, message: "Invalid query" } });
    };
    await expect(runSampler({ ...opts(s), http: bad })).rejects.toThrow(
      /stopped/i,
    );
    expect(calls).toBeLessThanOrEqual(3);
  });
});

describe("assertNoAccountData", () => {
  it("throws on account-like fields and whisper text", () => {
    expect(() => assertNoAccountData({ a: { accountName: "x" } })).toThrow();
    expect(() =>
      assertNoAccountData({ note: "Hi, I would like to buy your thing" }),
    ).toThrow();
    expect(() => assertNoAccountData({ amount: 1 })).not.toThrow();
  });
});

describe("sample-rolls CLI", () => {
  // A preload that makes any network access fail loudly.
  const NO_NET =
    "data:text/javascript,globalThis.fetch=()=>{throw new Error('network used')}";

  it("--dry-run prints the queries and touches no network", () => {
    const dir = tmpDir();
    const r = spawnSync(
      "node",
      [
        "--import",
        NO_NET,
        CLI,
        "--dry-run",
        "--lines",
        FIXTURE,
        "--unique",
        "Svalinn|Crucible Tower Shield",
        "--out",
        dir,
      ],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"type": "Crucible Tower Shield"');
    expect(r.stdout).toContain("explicit.stat_2905515354");
    expect(r.stdout).toMatch(/6 searches/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses to run live without --live", () => {
    const r = spawnSync("node", ["--import", NO_NET, CLI, "--lines", FIXTURE], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--live/);
  });
});
