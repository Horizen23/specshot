import http from "http";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { loadSpec } from "./spec-loader";
import { generateApi } from "./generate";
import { proxyRequest } from "./proxy-handler";
import {
  loadMockConfig,
  saveMockConfig,
  type MockConfigFile,
} from "../types/mock-config";
import { CONFIG_FILE } from "../types/constants";
import { flattenEndpoints, groupByTag } from "../utils/openapi-utils";
import { mockJsonFromSchema, getSchemaTypes } from "../utils/msw-utils";
import { fileURLToPath } from "url";

// Handlers
import type { HandlerContext } from "./handlers/types";
import { jsonResponse, parseBody } from "./handlers/utils";
import { handleGetSpec, handleRegenerateFaker } from "./handlers/spec-handler";
import { handleGetConfig, handlePostConfig } from "./handlers/config-handler";
import { handleGenerate } from "./handlers/generate-handler";
import { handleGetMockServer, handlePostMockServer } from "./handlers/mock-server-handler";
import { handleProxy } from "./handlers/proxy-config-handler";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Encapsulated server state — replaces bare module-level mutable variables
// ---------------------------------------------------------------------------
class MockServerState {
  server: http.Server | null = null;
  mockServer: http.Server | null = null;
  mockServerPort = 3457;
  restartTimer: ReturnType<typeof setTimeout> | null = null;

  get isRunning(): boolean {
    return this.mockServer !== null;
  }

  get isDashboardRunning(): boolean {
    return this.server !== null;
  }
}

const mockState = new MockServerState();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".svg": "image/svg+xml",
};

function serveUi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestPath: string,
) {
  let uiDist = path.resolve(__dirname, "../../ui/mock-ui/dist"); // from src/core/ (dev mode)
  if (!fs.existsSync(uiDist)) {
    uiDist = path.resolve(__dirname, "../ui/mock-ui/dist"); // from dist/ (prod bundle)
  }

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const filePath = path.join(uiDist, requestPath);

  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const content = fs.readFileSync(filePath);

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
  }
}

export function stopMockWebServer(): void {
  if (mockState.server) {
    mockState.server.close();
    mockState.server = null;
  }
  if (mockState.mockServer) {
    mockState.mockServer.close();
    mockState.mockServer = null;
  }
}

function matchPath(
  pattern: string,
  requestPath: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = requestPath.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    // MSW style :param or OpenAPI style {param}
    if (pp.startsWith(":") || (pp.startsWith("{") && pp.endsWith("}"))) {
      const name = pp.startsWith(":") ? pp.slice(1) : pp.slice(1, -1);
      params[name] = pathParts[i];
    } else if (pp !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

function createMockRequestHandler(cwd: string): http.RequestListener {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://localhost");
    const requestPath = url.pathname;
    const requestMethod = (req.method || "GET").toUpperCase();

    // Serve dashboard at root
    if (
      requestMethod === "GET" &&
      (requestPath === "/" || requestPath.startsWith("/assets/"))
    ) {
      serveUi(req, res, requestPath);
      return;
    }

    console.log(`[MockServer] ${requestMethod} ${requestPath}`);

    const config = loadMockConfig(cwd);
    const endpoints = config.endpoints || {};

    for (const [, entry] of Object.entries(endpoints)) {
      if (!entry.enabled) continue;
      if (entry.method.toUpperCase() !== requestMethod) continue;

      const params = matchPath(entry.path, requestPath);
      if (params === null) continue;

      const isError = entry.errorEnabled;
      const statusCode = isError
        ? entry.errorStatus || 500
        : entry.statusCode || 200;
      const delay = entry.delay || 0;

      const body = isError
        ? entry.errorBody ||
          JSON.stringify({ message: "Internal Server Error" })
        : entry.mockData || JSON.stringify({ ok: true });

      setTimeout(() => {
        res.writeHead(statusCode, {
          "Content-Type": "application/json",
        });
        res.end(body);
      }, delay);

      return;
    }

    // No mock matched — try proxy, then 404
    const proxyTarget = config.proxyTarget;
    if (proxyTarget && config.proxyEnabled !== false) {
      console.log(
        `[MockServer] → proxy ${requestMethod} ${requestPath} → ${proxyTarget}`,
      );
      proxyRequest(req, res, proxyTarget);
      return;
    }

    console.log(`[MockServer] 404 ${requestMethod} ${requestPath}`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No matching mock endpoint" }));
  };
}

function stopMockServerInternal(): void {
  if (mockState.mockServer) {
    mockState.mockServer.close();
    mockState.mockServer = null;
    console.log("[MockServer] Stopped");
  }
}

function startMockServerInternal(
  cwd: string,
  port: number,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    if (mockState.mockServer) {
      stopMockServerInternal();
    }

    const handler = createMockRequestHandler(cwd);
    const instance = http.createServer(handler);

    instance.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[MockServer] Port ${port} in use, trying ${port + 1}...`);
        instance.listen(port + 1);
      } else {
        reject(err);
      }
    });

    instance.listen(port, () => {
      const addr = instance.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      mockState.mockServerPort = actualPort;
      console.log(`[MockServer] Running on http://localhost:${actualPort}`);
      mockState.mockServer = instance;
      resolve(instance);
    });
  });
}

function restartMockServerOnConfigChange(cwd: string): void {
  if (!mockState.mockServer) return;
  if (mockState.restartTimer) clearTimeout(mockState.restartTimer);
  mockState.restartTimer = setTimeout(() => {
    mockState.restartTimer = null;
    stopMockServerInternal();
    startMockServerInternal(cwd, mockState.mockServerPort).catch((err) => {
      console.error(`[MockServer] Restart error: ${(err as Error).message}`);
    });
  }, 1000);
}



function getConfigPath(cwd: string): string {
  return path.resolve(cwd, CONFIG_FILE);
}

function readConfigIfExists(cwd: string): Record<string, unknown> {
  const configPath = getConfigPath(cwd);
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }
  return {};
}

export async function startMockWebServer(options: {
  url?: string;
  file?: string;
  output?: string;
  configPath?: string;
  port?: number;
  proxy?: string;
  noOpen?: boolean;
}): Promise<http.Server> {
  const cwd = process.cwd();
  const port = options.port || 3456;

  const existingConfig = loadMockConfig(cwd);
  mockState.mockServerPort = existingConfig.mockServerPort ?? 3457;

  if (options.proxy) {
    existingConfig.proxyTarget = options.proxy;
    existingConfig.proxyEnabled = true;
    saveMockConfig(existingConfig, cwd);
  }

  const initialSpecSource =
    options.file || options.url || existingConfig.specSource || "";
  const initialOutputDir = options.output || existingConfig.outputDir || "";
  const initialProxyTarget = existingConfig.proxyTarget || "";

  if (initialSpecSource) {
    const resolvedSource =
      initialSpecSource.startsWith("http://") ||
      initialSpecSource.startsWith("https://")
        ? initialSpecSource
        : path.resolve(cwd, initialSpecSource);
    console.log(`Pre-loaded spec source: ${resolvedSource}`);
  }

  const serverInstance = http.createServer(
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        const pathname = url.pathname;

        if (
          req.method === "GET" &&
          (pathname === "/" || pathname.startsWith("/assets/"))
        ) {
          serveUi(req, res, pathname);
          return;
        }

        const ctx: HandlerContext = {
          cwd,
          state: mockState,
          options,
          startMockServer: startMockServerInternal,
          stopMockServer: stopMockServerInternal,
          restartMockServer: restartMockServerOnConfigChange,
        };

        if (req.method === "GET" && pathname === "/api/spec") {
          await handleGetSpec(req, res, url, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/regenerate-faker") {
          await handleRegenerateFaker(req, res, ctx);
          return;
        }

        if (req.method === "GET" && pathname === "/api/config") {
          handleGetConfig(req, res, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/config") {
          await handlePostConfig(req, res, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/generate") {
          await handleGenerate(req, res, ctx);
          return;
        }

        if (req.method === "GET" && pathname === "/api/mock-server") {
          handleGetMockServer(req, res, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/mock-server") {
          await handlePostMockServer(req, res, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/proxy") {
          await handleProxy(req, res, ctx);
          return;
        }

        if (req.method === "POST" && pathname === "/api/preview") {
          jsonResponse(
            res,
            { error: "Preview not implemented in this version" },
            501,
          );
          return;
        }

        jsonResponse(res, { error: "Not found" }, 404);
      } catch (err) {
        jsonResponse(
          res,
          { error: (err as Error).message || "Internal server error" },
          500,
        );
      }
    },
  );

  mockState.server = serverInstance;

  return new Promise<http.Server>((resolve, reject) => {
    serverInstance.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        serverInstance.listen(port + 1);
      } else {
        reject(err);
      }
    });

    serverInstance.listen(port, () => {
      const addr = serverInstance.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      console.log(
        `\nSpecShot Mock Dashboard running at http://localhost:${actualPort}\n`,
      );

      if (!options.noOpen && !process.env.SPECSHOT_NO_BROWSER && !process.env.CI) {
        const platform = process.platform;
        const openCmd =
          platform === "darwin"
            ? `open http://localhost:${actualPort}`
            : platform === "win32"
              ? `start http://localhost:${actualPort}`
              : `xdg-open http://localhost:${actualPort}`;

        exec(openCmd, (err) => {
          if (err) {
            console.log(`Open http://localhost:${actualPort} in your browser`);
          }
        });
      }

      resolve(serverInstance);
    });
  });
}
