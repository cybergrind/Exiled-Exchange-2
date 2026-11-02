import { describe, expect, it } from "vitest";
import * as snapshotRules from "@/web/background/market/snapshot.ts";
import { mergeHistory } from "@/web/background/market/history.ts";
import {
  collectBody,
  handleMarketRequest,
  isMarketUrl,
  MAX_HISTORY_BYTES,
  MAX_SNAPSHOT_BYTES,
  parseMarketRoute,
  validateHistoryBody,
} from "@/web/background/market/marketFiles.ts";
import type {
  MarketDisk,
  MarketRequest,
} from "@/web/background/market/marketFiles.ts";
import type { Snapshot } from "@/web/background/market/snapshot.ts";

// main's /market/ route (guide/poe-source.html, WP-23 and WP-25). main has no
// test runner, so everything but the file system lives in marketFiles.ts.

const SNAPSHOT: Snapshot = {
  schemaVersion: 1,
  league: "Forbidden Rites",
  writtenAt: "2026-11-02T11:15:58.563Z",
  cx: null,
  relay: null,
};

async function* chunks(...parts: Array<string | Uint8Array>) {
  for (const part of parts) yield part;
}

function memoryDisk(files: Record<string, string> = {}) {
  const ops: string[] = [];
  const disk: MarketDisk = {
    async read(file) {
      ops.push(`read ${file}`);
      return files[file];
    },
    async replace(file, text) {
      ops.push(`replace ${file}`);
      files[file] = text;
    },
    async append(file, text) {
      ops.push(`append ${file}`);
      files[file] = (files[file] ?? "") + text;
    },
  };
  return { disk, files, ops };
}

function request(
  method: string,
  url: string,
  body = "",
  headers: MarketRequest["headers"] = {},
): MarketRequest {
  return { method, url, headers, body: chunks(body) };
}

const JSON_TYPE = { "content-type": "application/json" };
const NDJSON_TYPE = { "content-type": "application/x-ndjson" };

describe("isMarketUrl", () => {
  it("claims /market and everything under it, nothing else", () => {
    expect(isMarketUrl("/market/forbidden-rites.json")).toBe(true);
    expect(isMarketUrl("/market/../config.json")).toBe(true);
    expect(isMarketUrl("/market")).toBe(true);
    expect(isMarketUrl("/market?x=1")).toBe(true);
    expect(isMarketUrl("/marketplace.js")).toBe(false);
    expect(isMarketUrl("/proxy/market/x")).toBe(false);
    expect(isMarketUrl(undefined)).toBe(false);
  });
});

describe("parseMarketRoute", () => {
  const parse = (method: string, url: string) =>
    parseMarketRoute(method, url, snapshotRules);

  it("reads and writes <slug>.json, appends to <slug>.history", () => {
    expect(parse("GET", "/market/forbidden-rites.json")).toMatchObject({
      ok: true,
      target: {
        action: "read-snapshot",
        slug: "forbidden-rites",
        file: "forbidden-rites.json",
      },
    });
    expect(parse("PUT", "/market/hc-forbidden-rites.json")).toMatchObject({
      ok: true,
      target: {
        action: "write-snapshot",
        file: "hc-forbidden-rites.json",
        maxBytes: MAX_SNAPSHOT_BYTES,
      },
    });
    expect(parse("POST", "/market/forbidden-rites.history")).toMatchObject({
      ok: true,
      target: {
        action: "append-history",
        file: "forbidden-rites.history.ndjson",
        maxBytes: MAX_HISTORY_BYTES,
      },
    });
  });

  it.each([
    "/market/../config.json",
    "/market/..%2Fconfig.json",
    "/market/%2e%2e/config.json",
    "/market/a/b.json",
    "/market/.json",
    "/market/Forbidden-Rites.json",
    "/market/forbidden rites.json",
    "/market/forbidden--rites.json",
    "/market/-forbidden.json",
    "/market/forbidden-rites.json?x=1",
    "/market/forbidden-rites.json.tmp",
    "/market/forbidden-rites.history.ndjson",
    "/market/forbidden-rites",
    "/market/",
    "/market",
    "/market//etc/passwd",
    "/market/forbidden-rites.json/",
    "/market/forbidden-rites.json\\..\\x",
  ])("refuses %s", (url) => {
    for (const method of ["GET", "PUT", "POST"]) {
      expect(parse(method, url)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("uses snapshot.ts's slug rule", () => {
    for (const slug of [
      "forbidden-rites",
      "standard",
      "hc-runes-of-aldur",
      "a1-b2",
    ]) {
      expect(snapshotRules.isValidSlug(slug)).toBe(true);
      expect(parse("GET", `/market/${slug}.json`)?.ok).toBe(true);
    }
  });

  it("allows only GET and PUT on a snapshot, GET and POST on history", () => {
    for (const method of ["POST", "DELETE", "PATCH"]) {
      expect(parse(method, "/market/forbidden-rites.json")).toMatchObject({
        ok: false,
        status: 405,
      });
    }
    expect(parse("GET", "/market/forbidden-rites.history")).toMatchObject({
      ok: true,
      target: {
        action: "read-history",
        file: "forbidden-rites.history.ndjson",
      },
    });
    for (const method of ["PUT", "DELETE"]) {
      expect(parse(method, "/market/forbidden-rites.history")).toMatchObject({
        ok: false,
        status: 405,
      });
    }
  });

  it("leaves other URLs alone", () => {
    expect(parse("GET", "/index.html")).toBeUndefined();
  });
});

describe("collectBody", () => {
  it("joins chunks of bytes and strings", async () => {
    const bytes = new TextEncoder().encode("é-");
    const result = await collectBody(
      chunks(bytes.slice(0, 1), bytes.slice(1), "x"),
      10,
    );
    expect(result).toEqual({ ok: true, text: "é-x" });
  });

  it("refuses a body over the cap, counting bytes", async () => {
    // "é" is two bytes: four characters, eight bytes.
    const result = await collectBody(chunks("éé", "éé"), 7);
    expect(result).toMatchObject({ ok: false, status: 413 });
    expect(await collectBody(chunks("éé", "éé"), 8)).toEqual({
      ok: true,
      text: "éééé",
    });
  });

  it("drains the rest without keeping it", async () => {
    let pulled = 0;
    async function* many() {
      for (let i = 0; i < 100; i++) {
        pulled++;
        yield "x".repeat(10);
      }
    }
    expect(await collectBody(many(), 50)).toMatchObject({ ok: false });
    expect(pulled).toBe(100);
  });
});

describe("validateHistoryBody", () => {
  it("accepts NDJSON objects and ends every line with a newline", () => {
    expect(validateHistoryBody('{"a":1}\n{"b":2}')).toEqual({
      ok: true,
      text: '{"a":1}\n{"b":2}\n',
      lines: 2,
    });
    expect(validateHistoryBody('{"a":1}\r\n\n{"b":2}\n')).toEqual({
      ok: true,
      text: '{"a":1}\n{"b":2}\n',
      lines: 2,
    });
  });

  it("accepts an empty body as nothing to append", () => {
    expect(validateHistoryBody("")).toEqual({ ok: true, text: "", lines: 0 });
  });

  it.each(["[1]", "1", '"x"', "null", "{", '{"a":1} {"b":2}'])(
    "refuses a line %s",
    (line) => {
      expect(validateHistoryBody(`{"ok":1}\n${line}\n`)).toMatchObject({
        ok: false,
        status: 400,
      });
    },
  );
});

describe("handleMarketRequest", () => {
  it("serves a stored snapshot", async () => {
    const { disk } = memoryDisk({ "forbidden-rites.json": '{"x":1}' });
    const res = await handleMarketRequest(
      request("GET", "/market/forbidden-rites.json"),
      disk,
      snapshotRules,
    );
    expect(res).toMatchObject({ status: 200, body: '{"x":1}' });
    expect(res!.headers["content-type"]).toMatch(/^application\/json/);
    expect(res!.headers["cache-control"]).toBe("no-store");
  });

  it("answers 404 for a league with no snapshot", async () => {
    const { disk } = memoryDisk();
    const res = await handleMarketRequest(
      request("GET", "/market/forbidden-rites.json"),
      disk,
      snapshotRules,
    );
    expect(res?.status).toBe(404);
  });

  it("refuses ../ without touching the disk", async () => {
    const { disk, ops } = memoryDisk();
    for (const [method, url] of [
      ["GET", "/market/../config.json"],
      ["PUT", "/market/../config.json"],
      ["POST", "/market/../../x.history"],
      ["GET", "/market/..%2Fconfig.json"],
    ]) {
      const res = await handleMarketRequest(
        request(method, url, "{}", JSON_TYPE),
        disk,
        snapshotRules,
      );
      expect(res?.status).toBe(400);
    }
    expect(ops).toEqual([]);
  });

  it("writes a snapshot for its own league", async () => {
    const { disk, files } = memoryDisk();
    const text = snapshotRules.serializeSnapshot(SNAPSHOT);
    const res = await handleMarketRequest(
      request("PUT", "/market/forbidden-rites.json", text, JSON_TYPE),
      disk,
      snapshotRules,
    );
    expect(res?.status).toBe(204);
    expect(files["forbidden-rites.json"]).toBe(text);
  });

  it("refuses a snapshot that is not one, or is another league's", async () => {
    const { disk, ops } = memoryDisk();
    for (const body of [
      "not json",
      JSON.stringify({ ...SNAPSHOT, schemaVersion: 2 }),
      snapshotRules.serializeSnapshot({ ...SNAPSHOT, league: "Standard" }),
    ]) {
      const res = await handleMarketRequest(
        request("PUT", "/market/forbidden-rites.json", body, JSON_TYPE),
        disk,
        snapshotRules,
      );
      expect(res?.status).toBe(400);
    }
    expect(ops).toEqual([]);
  });

  it("refuses an oversized body by its declared length, before reading", async () => {
    const { disk, ops } = memoryDisk();
    let read = false;
    async function* body() {
      read = true;
      yield "{}";
    }
    const res = await handleMarketRequest(
      {
        method: "PUT",
        url: "/market/forbidden-rites.json",
        headers: {
          ...JSON_TYPE,
          "content-length": String(MAX_SNAPSHOT_BYTES + 1),
        },
        body: body(),
      },
      disk,
      snapshotRules,
    );
    expect(res?.status).toBe(413);
    expect(read).toBe(false);
    expect(ops).toEqual([]);
  });

  it("refuses an oversized body that did not declare its length", async () => {
    const { disk, ops } = memoryDisk();
    const line = `${JSON.stringify({ pad: "x".repeat(1000) })}\n`;
    const count = Math.ceil(MAX_HISTORY_BYTES / line.length) + 1;
    async function* body() {
      for (let i = 0; i < count; i++) yield line;
    }
    const res = await handleMarketRequest(
      {
        method: "POST",
        url: "/market/forbidden-rites.history",
        headers: NDJSON_TYPE,
        body: body(),
      },
      disk,
      snapshotRules,
    );
    expect(res?.status).toBe(413);
    expect(ops).toEqual([]);
  });

  it("merges history so each hour is stored once (WP-30)", async () => {
    const { disk, files, ops } = memoryDisk();
    const rules = { ...snapshotRules, mergeHistory };
    const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
    const line = (h: number) =>
      JSON.stringify({
        v: 1,
        hour: h,
        pairs: { x: { exalted: [1, 1, 1, 2, 2] } },
      });
    // An app start re-sends recent hours: the first is already stored.
    for (const body of [
      line(hour - 3600),
      `${line(hour - 3600)}\n${line(hour)}`,
    ]) {
      const res = await handleMarketRequest(
        request("POST", "/market/forbidden-rites.history", body, NDJSON_TYPE),
        disk,
        rules,
      );
      expect(res?.status).toBe(204);
    }
    expect(files["forbidden-rites.history.ndjson"]).toBe(
      `${line(hour - 3600)}\n${line(hour)}\n`,
    );
    // Rewritten whole, atomically, never appended.
    expect(ops.every((op) => !op.startsWith("append"))).toBe(true);
  });

  it("serves the history file for the chart (WP-31)", async () => {
    const text = '{"v":1,"hour":1,"pairs":{}}\n';
    const { disk } = memoryDisk({ "forbidden-rites.history.ndjson": text });
    const res = await handleMarketRequest(
      request("GET", "/market/forbidden-rites.history"),
      disk,
      snapshotRules,
    );
    expect(res?.status).toBe(200);
    expect(res?.headers["content-type"]).toMatch(/^application\/x-ndjson/);
    expect(res?.body).toBe(text);

    const none = await handleMarketRequest(
      request("GET", "/market/runes-of-aldur.history"),
      disk,
      snapshotRules,
    );
    expect(none?.status).toBe(404);
  });

  it("appends history lines when no merge is given", async () => {
    const { disk, files } = memoryDisk();
    for (const body of ['{"hour":1}\n', '{"hour":2}']) {
      const res = await handleMarketRequest(
        request("POST", "/market/forbidden-rites.history", body, NDJSON_TYPE),
        disk,
        snapshotRules,
      );
      expect(res?.status).toBe(204);
    }
    expect(files["forbidden-rites.history.ndjson"]).toBe(
      '{"hour":1}\n{"hour":2}\n',
    );
  });

  it("appends nothing for an empty or invalid history body", async () => {
    const { disk, ops } = memoryDisk();
    const empty = await handleMarketRequest(
      request("POST", "/market/forbidden-rites.history", "", NDJSON_TYPE),
      disk,
      snapshotRules,
    );
    expect(empty?.status).toBe(204);
    const bad = await handleMarketRequest(
      request("POST", "/market/forbidden-rites.history", "[1]", NDJSON_TYPE),
      disk,
      snapshotRules,
    );
    expect(bad?.status).toBe(400);
    expect(ops).toEqual([]);
  });

  it("needs the right content type to write, so a web page cannot post without a preflight", async () => {
    const { disk, ops } = memoryDisk();
    const text = snapshotRules.serializeSnapshot(SNAPSHOT);
    for (const [method, url, type] of [
      ["PUT", "/market/forbidden-rites.json", "text/plain"],
      ["PUT", "/market/forbidden-rites.json", undefined],
      ["POST", "/market/forbidden-rites.history", "text/plain;charset=UTF-8"],
      ["POST", "/market/forbidden-rites.history", "application/json"],
    ] as const) {
      const res = await handleMarketRequest(
        request(method, url, text, type ? { "content-type": type } : {}),
        disk,
        snapshotRules,
      );
      expect(res?.status).toBe(415);
    }
    expect(ops).toEqual([]);
    const ok = await handleMarketRequest(
      request("PUT", "/market/forbidden-rites.json", text, {
        "content-type": "Application/JSON; charset=utf-8",
      }),
      disk,
      snapshotRules,
    );
    expect(ok?.status).toBe(204);
  });

  it("ignores URLs that are not its own", async () => {
    const { disk } = memoryDisk();
    expect(
      await handleMarketRequest(
        request("GET", "/index.html"),
        disk,
        snapshotRules,
      ),
    ).toBeUndefined();
  });
});
