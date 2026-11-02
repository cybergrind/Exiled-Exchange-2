import { WebSocketServer, type WebSocket } from "ws";
import { type AddressInfo } from "net";
import { createServer, type Server } from "http";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { app } from "electron";
import { IpcEvent, IpcEventPayload, HostState } from "../../ipc/types";
import { ConfigStore } from "./host-files/ConfigStore";
import { addFileUploadRoutes } from "./host-files/file-uploads";
import type { AppUpdater } from "./AppUpdater";
import type { Logger } from "./RemoteLogger";
// Shared with the renderer, where they are unit-tested. No ".ts" extension:
// this tsconfig does not allow it, and esbuild resolves either way.
import {
  handleMarketRequest,
  isMarketUrl,
  type MarketDisk,
} from "../../renderer/src/web/background/market/marketFiles";
import * as snapshotRules from "../../renderer/src/web/background/market/snapshot";
import { mergeHistory } from "../../renderer/src/web/background/market/history";

// Each history POST is merged so an hour is stored once (WP-30).
const marketRules = { ...snapshotRules, mergeHistory };

export const server = createServer();
const websocketServer = new WebSocketServer({ noServer: true });
let lastActiveClient: WebSocket;

addFileUploadRoutes(server);
addMarketRoutes(
  server,
  path.join(app.getPath("userData"), "apt-data", "market"),
);

if (!process.env.VITE_DEV_SERVER_URL) {
  server.addListener("request", (req, res) => {
    if (
      req.url?.startsWith("/config") ||
      req.url?.startsWith("/uploads") ||
      req.url?.startsWith("/proxy") ||
      isMarketUrl(req.url)
    )
      return;

    const filePath = req.url === "/" ? "/index.html" : req.url!;
    switch (path.extname(filePath)) {
      case ".html":
        res.setHeader("content-type", "text/html");
        break;
      case ".js":
        res.setHeader("content-type", "text/javascript");
        break;
      case ".json":
        res.setHeader("content-type", "application/json");
        break;
      case ".svg":
        res.setHeader("content-type", "image/svg+xml");
        break;
    }

    fs.createReadStream(path.join(__dirname, filePath)).pipe(res);
  });
}

/**
 * GET and PUT /market/<slug>.json, POST /market/<slug>.history: the price
 * snapshot and its history under apt-data/market/ (guide/poe-source.html,
 * WP-23 and WP-25). Validation lives in marketFiles.ts; this is the disk.
 */
export function addMarketRoutes(server: Server, dir: string) {
  const disk = marketDisk(path.resolve(dir));
  server.addListener("request", (req, res) => {
    if (!isMarketUrl(req.url)) return;
    handleMarketRequest(
      { method: req.method, url: req.url, headers: req.headers, body: req },
      disk,
      marketRules,
    )
      .then((answer) => {
        const { status, headers, body } = answer ?? {
          status: 404,
          headers: {},
          body: "",
        };
        res.writeHead(status, headers);
        res.end(body);
      })
      .catch((err: Error) => {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end(err.message);
      });
  });
}

function marketDisk(dir: string): MarketDisk {
  const full = (file: string) => {
    // Names come from parseMarketRoute; this only guards against a bug there.
    const resolved = path.resolve(dir, file);
    if (path.dirname(resolved) !== dir || path.basename(resolved) !== file) {
      throw new Error(`Bad market file name ${file}`);
    }
    return resolved;
  };
  return {
    async read(file) {
      try {
        return await fsp.readFile(full(file), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw err;
      }
    },
    async replace(file, text) {
      // Temp file and rename: a killed write never leaves a truncated file.
      const target = full(file);
      const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await fsp.mkdir(dir, { recursive: true });
      try {
        await fsp.writeFile(temp, text);
        await fsp.rename(temp, target);
      } catch (err) {
        await fsp.rm(temp, { force: true });
        throw err;
      }
    },
    async append(file, text) {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.appendFile(full(file), text);
    },
  };
}

const evBus = new EventEmitter();

export function onEventAnyClient<Name extends IpcEvent["name"]>(
  name: Name,
  cb: (payload: IpcEventPayload<Name>) => void,
) {
  evBus.on(name, cb);
}

export function sendEventTo(
  target: "last-active" | "any" | "broadcast",
  event: IpcEvent,
) {
  const msg = JSON.stringify(event);
  if (target === "broadcast") {
    for (const client of websocketServer.clients) {
      client.send(msg);
    }
  } else {
    lastActiveClient.send(msg);
  }
}

export interface ServerEvents {
  onEventAnyClient: typeof onEventAnyClient;
  sendEventTo: typeof sendEventTo;
}
export const eventPipe = {
  onEventAnyClient,
  sendEventTo,
};

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/events") {
    return req.destroy();
  }
  websocketServer.handleUpgrade(req, socket, head, (ws) => {
    websocketServer.emit("connection", ws, req);
  });
});

export async function startServer(
  appUpdater: AppUpdater,
  logger: Logger,
): Promise<number> {
  const configStore = new ConfigStore(eventPipe);

  websocketServer.on("connection", (socket) => {
    lastActiveClient = socket;
    socket.on("message", (bytes) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const event = JSON.parse(bytes.toString("utf-8")) as IpcEvent;
      if (event.name === "CLIENT->MAIN::used-recently") {
        lastActiveClient = socket;
      }
      evBus.emit(event.name, event.payload);
    });
    socket.on("close", () => {
      const clients = websocketServer.clients;
      if (clients.size === 1) {
        lastActiveClient = clients.values().next().value!;
        evBus.emit("CLIENT->MAIN::used-recently", { isOverlay: true });
      }
    });
    sendEventTo("last-active", {
      name: "MAIN->CLIENT::log-entry",
      payload: { message: logger.history },
    });
  });

  server.addListener("request", async (req, res) => {
    if (req.url === "/config") {
      res.setHeader("content-type", "application/json");
      const resBody: HostState = {
        version: app.getVersion(),
        updater: appUpdater.info,
        contents: await configStore.load(),
      };
      res.end(JSON.stringify(resBody));
    }
  });

  let port = process.env.VITE_DEV_SERVER_URL ? 8584 : 0;
  let host = "127.0.0.1";
  // --listen=[host][:port]
  const listenOpt = process.argv.find((arg) => arg.startsWith("--listen"));
  if (listenOpt) {
    const [hostArg, portArg] = listenOpt.split("=")[1].split(":");
    if (hostArg) host = hostArg;
    if (portArg) port = parseInt(portArg, 10);
  }

  return await new Promise((resolve, reject) => {
    server
      .listen({ port, host })
      .once("error", reject)
      .once("listening", () => {
        resolve((server.address() as AddressInfo).port);
      });
  });
}
