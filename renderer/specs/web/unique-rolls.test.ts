import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  findAccountLikeFields,
  statLookupFromNdjson,
  uniqueNamesFromNdjson,
  validateRollProfile,
} from "@/web/background/market/rollProfileSchema.ts";
import type { ValidationError } from "@/web/background/market/rollProfileSchema.ts";

// WP-62 · Roll profile schema and validator (guide/poe-source.html, D7).

const DATA = path.resolve(__dirname, "../../public/data");
const STATS = statLookupFromNdjson(
  fs.readFileSync(path.join(DATA, "en/stats.ndjson"), "utf8"),
);
// items-patch.ndjson serves uniques the generated file lacks (renamed ones).
const UNIQUES = uniqueNamesFromNdjson(
  ["items.ndjson", "items-patch.ndjson"]
    .map((name) => fs.readFileSync(path.join(DATA, "en", name), "utf8"))
    .join("\n"),
);
const OPTS = { statBetter: STATS, hasUnique: (n: string) => UNIQUES.has(n) };
const SHIPPED = path.join(DATA, "poe-source/unique-rolls.json");
const CLI = path.resolve(__dirname, "../../../tools/validate-rolls.ts");

// Thresholds and evidence are made up for the test; the stat refs are real.
function sample() {
  return {
    schemaVersion: 1,
    league: "Forbidden Rites",
    verifiedOn: "2026-11-02",
    uniques: {
      Svalinn: {
        tier: "A",
        summary:
          "Block shield; the damage-from-blocked-hits roll matters most.",
        rolls: [
          {
            statRef: "You take #% of damage from Blocked Hits",
            importance: "key",
            thresholds: { good: 10, great: 4 },
            why: "Lower is better; prices rise sharply in the low band.",
            evidence: ["M1"],
          },
          {
            statRef: "#% increased Armour",
            importance: "good",
            thresholds: { good: 250, great: 285 },
            why: "Armour scales the shield's main defence.",
            evidence: ["G1"],
          },
          {
            statRef: "# to maximum Runic Ward",
            importance: "filler",
            why: "No price effect found.",
            evidence: [],
          },
        ],
        evidence: {
          M1: {
            kind: "market",
            note: "low band 31 listings from 1.2 div, high band 40 from 0.3 div",
            date: "2026-11-02",
          },
          G1: {
            kind: "guide",
            url: "https://example.org/guides/block-warrior",
            date: "2026-10-30",
          },
        },
      },
    },
  };
}

type Sample = ReturnType<typeof sample>;
type Roll = Sample["uniques"]["Svalinn"]["rolls"][number];

function sv(p: Sample) {
  return p.uniques.Svalinn as unknown as {
    rolls: Array<Record<string, unknown>>;
    evidence: Record<string, Record<string, unknown>>;
    [k: string]: unknown;
  };
}

function errorsOf(p: unknown): ValidationError[] {
  return validateRollProfile(p, OPTS);
}

function paths(p: unknown): string[] {
  return errorsOf(p).map((e) => e.path);
}

describe("validateRollProfile", () => {
  it("accepts a valid profile", () => {
    expect(errorsOf(sample())).toEqual([]);
  });

  it("returns errors with JSON paths and messages", () => {
    const p = sample();
    (p.uniques.Svalinn.rolls[1] as Roll).statRef = "#% increased Armor";
    const errors = errorsOf(p);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.uniques["Svalinn"].rolls[1].statRef');
    expect(errors[0].message).toMatch(/stats\.ndjson/);
  });

  describe("statRef", () => {
    it("rejects a ref that is not in stats.ndjson", () => {
      const p = sample();
      sv(p).rolls[0].statRef = "#% of damage from Blocked Hits";
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].statRef']);
    });

    it("rejects a trade id: statRef is the stats.ndjson ref, not a trade id", () => {
      const p = sample();
      sv(p).rolls[0].statRef = "explicit.stat_2905515354";
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].statRef']);
    });

    it("rejects a missing statRef", () => {
      const p = sample();
      delete sv(p).rolls[0].statRef;
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].statRef']);
    });
  });

  describe("evidence rules", () => {
    it("rejects key with a single guide", () => {
      const p = sample();
      sv(p).rolls[0].evidence = ["G1"];
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].evidence']);
    });

    it("rejects key with two guides from the same host", () => {
      const p = sample();
      sv(p).evidence.G2 = {
        kind: "guide",
        url: "https://EXAMPLE.org/another-guide",
        date: "2026-10-31",
      };
      sv(p).rolls[0].evidence = ["G1", "G2"];
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].evidence']);
    });

    it("accepts key with two guides from different hosts", () => {
      const p = sample();
      sv(p).evidence.G2 = {
        kind: "guide",
        url: "https://poe2db.tw/us/Svalinn",
        date: "2026-10-31",
      };
      sv(p).rolls[0].evidence = ["G1", "G2"];
      expect(errorsOf(p)).toEqual([]);
    });

    it("rejects key backed only by mechanic text", () => {
      const p = sample();
      sv(p).evidence.X1 = {
        kind: "mechanic",
        url: "https://www.poe2wiki.net/wiki/Block",
        date: "2026-10-31",
      };
      sv(p).rolls[0].evidence = ["X1"];
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].evidence']);
    });

    it("rejects good without evidence", () => {
      const p = sample();
      sv(p).rolls[1].evidence = [];
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[1].evidence']);
    });

    it("accepts good with one market sample", () => {
      const p = sample();
      sv(p).rolls[1].evidence = ["M1"];
      expect(errorsOf(p)).toEqual([]);
    });

    it("accepts filler without evidence", () => {
      const p = sample();
      sv(p).rolls[2].evidence = [];
      expect(errorsOf(p)).toEqual([]);
    });

    it("rejects an evidence id that is not defined", () => {
      const p = sample();
      sv(p).rolls[2].evidence = ["G9"];
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[2].evidence[0]']);
    });

    it("rejects a guide without an http(s) url", () => {
      const p = sample();
      sv(p).evidence.G1.url = "my memory";
      expect(paths(p)).toContain('$.uniques["Svalinn"].evidence["G1"].url');
    });

    it("rejects an unknown evidence kind", () => {
      const p = sample();
      sv(p).evidence.G1.kind = "recall";
      expect(paths(p)).toContain('$.uniques["Svalinn"].evidence["G1"].kind');
    });
  });

  describe("dates", () => {
    it("rejects evidence without a date", () => {
      const p = sample();
      delete sv(p).evidence.M1.date;
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].evidence["M1"].date']);
    });

    it.each(["2026-11-2", "02.11.2026", "2026-02-30", "2026-11-02T10:00:00Z"])(
      "rejects the evidence date %s",
      (date) => {
        const p = sample();
        sv(p).evidence.G1.date = date;
        expect(paths(p)).toEqual(['$.uniques["Svalinn"].evidence["G1"].date']);
      },
    );

    it("rejects a missing verifiedOn", () => {
      const p = sample() as Partial<Sample>;
      delete p.verifiedOn;
      expect(paths(p)).toEqual(["$.verifiedOn"]);
    });

    it("rejects an invalid verifiedOn", () => {
      const p = sample();
      p.verifiedOn = "yesterday";
      expect(paths(p)).toEqual(["$.verifiedOn"]);
    });
  });

  describe("account-like fields", () => {
    it.each([
      ["account", (p: Sample) => (sv(p).account = "x")],
      ["accountName", (p: Sample) => (sv(p).rolls[0].accountName = "x")],
      ["character", (p: Sample) => (sv(p).evidence.M1.character = "x")],
      ["characterName", (p: Sample) => (sv(p).evidence.M1.characterName = "x")],
      ["seller", (p: Sample) => (sv(p).evidence.G1.seller = "x")],
      ["whisper", (p: Sample) => (sv(p).rolls[1].whisper = "x")],
      ["lastCharacterName", (p: Sample) => (sv(p).lastCharacterName = "x")],
    ])("rejects %s", (key, mutate) => {
      const p = sample();
      mutate(p);
      expect(errorsOf(p).some((e) => e.path.endsWith(`.${key}`))).toBe(true);
    });

    it("finds them at any depth and in any case", () => {
      expect(
        findAccountLikeFields({
          a: [{ b: { AccountName: "x" } }],
          listing: { account: { name: "y" } },
          top: { Last_Character_Name: "z" },
        }),
      ).toEqual([
        "$.a[0].b.AccountName",
        "$.listing.account",
        "$.top.Last_Character_Name",
      ]);
    });

    it("rejects whisper text in a value", () => {
      const p = sample();
      sv(p).evidence.M1.note =
        "@Someone Hi, I would like to buy your Svalinn listed for 2 divine in Forbidden Rites";
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].evidence["M1"].note']);
    });

    it("rejects them at the top level", () => {
      const p = { ...sample(), seller: "x" };
      expect(paths(p)).toContain("$.seller");
    });
  });

  describe("shape", () => {
    it("rejects schemaVersion other than 1", () => {
      const p = { ...sample(), schemaVersion: 2 };
      expect(paths(p)).toEqual(["$.schemaVersion"]);
    });

    it("rejects a tier outside A, B, C", () => {
      const p = sample();
      sv(p).tier = "S";
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].tier']);
    });

    it("rejects an unknown importance", () => {
      const p = sample();
      sv(p).rolls[2].importance = "critical";
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[2].importance']);
    });

    it("rejects a unique name the app does not know", () => {
      const p = sample() as { uniques: Record<string, unknown> };
      p.uniques.Svallin = p.uniques.Svalinn;
      delete p.uniques.Svalinn;
      expect(paths(p)).toEqual(['$.uniques["Svallin"]']);
    });

    it("rejects unknown fields (typos)", () => {
      const p = sample();
      sv(p).rolls[0].treshold = { good: 1, great: 2 };
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].treshold']);
    });

    it("needs thresholds on key and good rolls of comparable stats", () => {
      const p = sample();
      delete sv(p).rolls[1].thresholds;
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[1].thresholds']);
    });
  });

  describe("thresholds respect StatBetter", () => {
    it("rejects good above great when higher is better", () => {
      const p = sample();
      sv(p).rolls[1].thresholds = { good: 290, great: 250 };
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[1].thresholds']);
    });

    it("rejects good below great when lower is better", () => {
      const p = sample();
      sv(p).rolls[0].thresholds = { good: 4, great: 10 };
      expect(paths(p)).toEqual(['$.uniques["Svalinn"].rolls[0].thresholds']);
    });

    it("accepts good equal to great", () => {
      const p = sample();
      sv(p).rolls[1].thresholds = { good: 280, great: 280 };
      expect(errorsOf(p)).toEqual([]);
    });

    it("rejects non-numeric thresholds", () => {
      const p = sample();
      sv(p).rolls[1].thresholds = { good: "250", great: 285 };
      expect(paths(p)).toEqual([
        '$.uniques["Svalinn"].rolls[1].thresholds.good',
      ]);
    });
  });
});

describe("shipped unique-rolls.json", () => {
  it("is valid", () => {
    const data: unknown = JSON.parse(fs.readFileSync(SHIPPED, "utf8"));
    expect(validateRollProfile(data, OPTS)).toEqual([]);
    expect(data).toMatchObject({
      schemaVersion: 1,
      league: "Forbidden Rites",
    });
  });
});

describe("validate-rolls CLI", () => {
  function run(files: string[]) {
    return spawnSync("node", [CLI, ...files], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
  }

  function write(name: string, data: unknown): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-rolls-"));
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  }

  it("exits 0 on a valid file", () => {
    const r = run([write("svalinn.json", sample())]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("exits 1 and prints every error with file and path", () => {
    const p = sample();
    sv(p).rolls[0].statRef = "nope";
    sv(p).evidence.G1.date = "soon";
    const file = write("svalinn.json", p);
    const r = run([file]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(file);
    expect(r.stderr).toContain('$.uniques["Svalinn"].rolls[0].statRef');
    expect(r.stderr).toContain('$.uniques["Svalinn"].evidence["G1"].date');
  });

  it("exits 1 on a file that is not JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-rolls-"));
    const file = path.join(dir, "broken.json");
    fs.writeFileSync(file, "{");
    const r = run([file]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(file);
  });

  it("validates the shipped file", () => {
    const r = run([SHIPPED]);
    expect(r.status).toBe(0);
  });
});
