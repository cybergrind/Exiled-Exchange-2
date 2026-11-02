// make update-prices / ./run: refresh the price snapshot for one league
// (guide/poe-source.html, D4 and WP-20). Plain Node, no compiler:
//   node renderer/scripts/update-prices.ts [--league <id>] [--data-dir <dir>]
//                                          [--if-older-than <minutes>]
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { leagueSlug } from "../src/web/background/market/snapshot.ts";
import { updateSnapshot } from "../src/web/background/market/update.ts";
import type {
  HttpGet,
  SnapshotStore,
} from "../src/web/background/market/update.ts";

const USAGE = `Usage: node renderer/scripts/update-prices.ts [options]

Fetches the GGG Currency Exchange feed and the relay's price overview, and
writes <data-dir>/market/<league>.json for the app to load at start.

Options:
  --league <id>              League, e.g. "Forbidden Rites". Default: the
                             league selected in the app's config.json.
  --data-dir <dir>           The app's apt-data directory. Default:
                             ${defaultDataDir()}
  --if-older-than <minutes>  Do nothing if the snapshot is younger than this.
  --help                     Show this text.

Exit status: 0 written or fresh, 1 update failed (previous file kept),
2 bad arguments.`;

const USER_AGENT = "Exiled-Exchange-2 (update-prices)";
const REQUEST_TIMEOUT_MS = 15_000;

/** Electron's userData for the app, plus apt-data (main/src/host-files). */
function defaultDataDir(): string {
  const app = "exiled-exchange-2";
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), app, "apt-data");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library/Application Support",
      app,
      "apt-data",
    );
  }
  const config =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(config, app, "apt-data");
}

class UsageError extends Error {}

interface Args {
  league?: string;
  dataDir: string;
  ifOlderThan?: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dataDir: defaultDataDir(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--league":
        args.league = value();
        break;
      case "--data-dir":
        args.dataDir = value();
        break;
      case "--if-older-than": {
        const minutes = Number(value());
        if (!Number.isFinite(minutes) || minutes < 0) {
          throw new UsageError("--if-older-than needs a number of minutes");
        }
        args.ifOlderThan = minutes;
        break;
      }
      default:
        throw new UsageError(`Unknown option ${flag}`);
    }
  }
  return args;
}

async function configuredLeague(dataDir: string): Promise<string | undefined> {
  try {
    const config = JSON.parse(
      await fs.readFile(path.join(dataDir, "config.json"), "utf8"),
    ) as { leagueId?: unknown };
    return typeof config.leagueId === "string" ? config.leagueId : undefined;
  } catch {
    return undefined;
  }
}

function fileStore(root: string): SnapshotStore {
  const resolve = (name: string) => {
    const full = path.resolve(root, name);
    if (!full.startsWith(root + path.sep))
      throw new Error(`Bad file name ${name}`);
    return full;
  };
  return {
    async read(name) {
      try {
        return await fs.readFile(resolve(name), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw err;
      }
    },
    async write(name, text) {
      // Temp file and rename: a killed write never leaves a truncated file.
      const full = resolve(name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const temp = `${full}.${process.pid}.tmp`;
      await fs.writeFile(temp, text);
      await fs.rename(temp, full);
    },
    async list(dir) {
      try {
        return (await fs.readdir(resolve(dir))).filter(
          (n) => !n.endsWith(".tmp"),
        );
      } catch {
        return [];
      }
    },
    async remove(name) {
      await fs.rm(resolve(name), { force: true });
    },
  };
}

const http: HttpGet = async (url, headers = {}) => {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return { status: res.status, body: await res.text(), headers: out };
};

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const league = args.league ?? (await configuredLeague(args.dataDir));
  if (!league) {
    process.stderr.write(
      `No league: pass --league, or select one in the app first (${path.join(args.dataDir, "config.json")}).\n`,
    );
    return 2;
  }

  const root = path.resolve(args.dataDir, "market");
  try {
    const result = await updateSnapshot({
      league,
      nowMs: Date.now(),
      http,
      store: fileStore(root),
      log: (message) => process.stderr.write(`warning: ${message}\n`),
      ifOlderThanMinutes: args.ifOlderThan,
    });
    for (const notice of result.notices) {
      process.stdout.write(`notice: ${notice}\n`);
    }
    const file = path.join(root, `${leagueSlug(league)}.json`);
    if (result.status === "fresh") {
      process.stdout.write(
        `${league}: snapshot is fresh (written ${result.snapshot.writtenAt}), nothing to do.\n`,
      );
      return 0;
    }
    const cx = result.snapshot.cx;
    const asOf = cx
      ? new Date(cx.asOfHour * 1000).toISOString().slice(11, 16)
      : "none";
    process.stdout.write(
      `${league}: wrote ${file} (Currency Exchange as of ${asOf} UTC, ` +
        `${cx ? Object.keys(cx.pairs).length : 0} items; relay ${result.snapshot.relay ? "ok" : "missing"}).\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

process.exitCode = await main();
