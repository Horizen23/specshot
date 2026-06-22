import http from "http";
import https from "https";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { loadSpec } from "./spec-loader";
import { generateApi } from "./generate";
import {
  loadMockConfig,
  saveMockConfig,
  endpointKey,
  type MockConfigFile,
  type MockEndpointEntry,
} from "../types/mock-config";
import { CONFIG_FILE } from "../types/constants";
import { flattenEndpoints, groupByTag } from "../utils/openapi-utils";
import { mockJsonFromSchema } from "../utils/msw-utils";
import type { OpenApiSpec } from "../types/types";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: http.Server | null = null;
let mockServer: http.Server | null = null;
let mockServerPort = 3457;
let mockServerRestartTimer: ReturnType<typeof setTimeout> | null = null;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.svg': 'image/svg+xml',
};

function serveUi(req: http.IncomingMessage, res: http.ServerResponse, requestPath: string) {
  let uiDist = path.resolve(__dirname, '../../ui/mock-ui/dist'); // from src/core/ (dev mode)
  if (!fs.existsSync(uiDist)) {
    uiDist = path.resolve(__dirname, '../ui/mock-ui/dist'); // from dist/ (prod bundle)
  }
  
  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  const filePath = path.join(uiDist, requestPath);
  
  try {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
}

export function stopMockWebServer(): void {
  if (server) {
    server.close();
    server = null;
  }
  if (mockServer) {
    mockServer.close();
    mockServer = null;
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


function createMockRequestHandler(
  cwd: string,
): http.RequestListener {
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
    if (requestMethod === "GET" && (requestPath === "/" || requestPath.startsWith("/assets/"))) {
      serveUi(req, res, requestPath);
      return;
    }

    console.log(
      `[MockServer] ${requestMethod} ${requestPath}`,
    );

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

    // No mock matched, try proxy
    const proxyTarget = config.proxyTarget;
    if (proxyTarget && config.proxyEnabled !== false) {
      console.log(
        `[MockServer] → proxy ${requestMethod} ${requestPath} → ${proxyTarget}`,
      );
      const targetUrl = new URL(proxyTarget);
      const isHttps = targetUrl.protocol === "https:";
      const proxyModule = isHttps ? https : http;

      const proxyReq = proxyModule.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: req.url,
          method: requestMethod,
          headers: {
            ...Object.fromEntries(
              Object.entries(req.headers).filter(
                ([k]) => k !== "host",
              ),
            ),
          },
        },
        (proxyRes) => {
          res.writeHead(
            proxyRes.statusCode || 502,
            proxyRes.headers,
          );
          proxyRes.pipe(res);
        },
      );

      proxyReq.on("error", () => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Proxy error" }),
        );
      });

      req.pipe(proxyReq);
      return;
    }

    console.log(
      `[MockServer] 404 ${requestMethod} ${requestPath}`,
    );
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: "No matching mock endpoint" }),
    );
  };
}

function stopMockServerInternal(): void {
  if (mockServer) {
    mockServer.close();
    mockServer = null;
    console.log("[MockServer] Stopped");
  }
}

function startMockServerInternal(
  cwd: string,
  port: number,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    if (mockServer) {
      stopMockServerInternal();
    }

    const handler = createMockRequestHandler(cwd);
    const instance = http.createServer(handler);

    instance.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          `[MockServer] Port ${port} in use, trying ${port + 1}...`,
        );
        instance.listen(port + 1);
      } else {
        reject(err);
      }
    });

    instance.listen(port, () => {
      const addr = instance.address();
      const actualPort =
        typeof addr === "object" && addr ? addr.port : port;
      mockServerPort = actualPort;
      console.log(
        `[MockServer] Running on http://localhost:${actualPort}`,
      );
      mockServer = instance;
      resolve(instance);
    });
  });
}

function restartMockServerOnConfigChange(cwd: string): void {
  if (!mockServer) return;
  if (mockServerRestartTimer)
    clearTimeout(mockServerRestartTimer);
  mockServerRestartTimer = setTimeout(() => {
    mockServerRestartTimer = null;
    stopMockServerInternal();
    startMockServerInternal(cwd, mockServerPort).catch(
      (err) => {
        console.error(
          `[MockServer] Restart error: ${(err as Error).message}`,
        );
      },
    );
  }, 1000);
}

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function resolveSpecSource(query: URLSearchParams, cwd: string): string | null {
  const source = query.get("source");
  if (!source) return null;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }
  return path.resolve(cwd, source);
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
}): Promise<http.Server> {
  const cwd = process.cwd();
  const port = options.port || 3456;

  const existingConfig = loadMockConfig(cwd);
  mockServerPort =
    (existingConfig as any).mockServerPort || 3457;

  if (options.proxy) {
    existingConfig.proxyTarget = options.proxy;
    existingConfig.proxyEnabled = true;
    saveMockConfig(existingConfig, cwd);
  }

  const initialSpecSource = options.file || options.url || existingConfig.specSource || "";
  const initialOutputDir = options.output || existingConfig.outputDir || "";
  const initialProxyTarget = existingConfig.proxyTarget || "";

  if (initialSpecSource) {
    const resolvedSource =
      initialSpecSource.startsWith("http://") ||
      initialSpecSource.startsWith("https://")
        ? initialSpecSource
        : path.resolve(cwd, initialSpecSource);
    console.log(
      `Pre-loaded spec source: ${resolvedSource}`,
    );
  }

  const serverInstance = http.createServer(
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        const pathname = url.pathname;

        if (req.method === "GET" && (pathname === "/" || pathname.startsWith("/assets/"))) {
          serveUi(req, res, pathname);
          return;
        }

        if (req.method === "GET" && pathname === "/api/spec") {
          const specSource = resolveSpecSource(url.searchParams, cwd);
          if (!specSource) {
            jsonResponse(
              res,
              { error: "Missing 'source' query parameter" },
              400,
            );
            return;
          }

          const spec = await loadSpec(specSource);
          const endpoints = flattenEndpoints(spec);
          const groupedByTag = groupByTag(endpoints);
          const tags = Array.from(groupedByTag.entries()).map(([tag, eps]) => ({
            tag,
            count: eps.length,
            endpoints: eps,
          }));

          const existingConfig = loadMockConfig(cwd);
          const enabledKeys = new Set(
            Object.entries(existingConfig.endpoints || {})
              .filter(([, v]) => v.enabled)
              .map(([k]) => k),
          );

          const tagsWithPreSelected = tags.map((t) => ({
            ...t,
            endpoints: t.endpoints.map((ep) => ({
              ...ep,
              enabled: enabledKeys.has(ep.key),
              config: existingConfig.endpoints?.[ep.key] || null,
            })),
          }));

          jsonResponse(res, {
            specSource,
            tags: tagsWithPreSelected,
            totalEndpoints: endpoints.length,
          });
          return;
        }

        if (req.method === "GET" && pathname === "/api/config") {
          const config = loadMockConfig(cwd) as MockConfigFile & Record<string, unknown>;
          config.mockServerPort = mockServerPort;
          config.mockServerRunning = mockServer !== null;
          if (options.file || options.url) {
            config.specSource = options.file || options.url || config.specSource;
          }
          if (options.output) {
            config.outputDir = options.output;
          }
          jsonResponse(res, config);
          return;
        }

        if (req.method === "POST" && pathname === "/api/config") {
          const body = await parseBody(req);
          const incomingConfig: MockConfigFile = JSON.parse(body);
          const existingConfig = loadMockConfig(cwd);
          
          const newConfig = {
            ...existingConfig,
            ...incomingConfig,
            endpoints: incomingConfig.endpoints || existingConfig.endpoints || {}
          } as MockConfigFile & Record<string, unknown>;
          
          newConfig.mockServerPort = mockServerPort;
          saveMockConfig(newConfig, cwd);
          restartMockServerOnConfigChange(cwd);
          jsonResponse(res, { ok: true });
          return;
        }

        if (req.method === "POST" && pathname === "/api/generate") {
          const body = await parseBody(req);
          const {
            specSource,
            outputDir,
            endpoints: configEndpoints,
          } = JSON.parse(body);

          if (!specSource || !outputDir) {
            jsonResponse(
              res,
              { error: "Missing specSource or outputDir" },
              400,
            );
            return;
          }

          const resolvedOutputDir = path.resolve(cwd, outputDir);
          const providerDirFromOutput = path.dirname(
            path.dirname(resolvedOutputDir),
          );
          const servicesDir = path.join(providerDirFromOutput, "services");

          const mockConfig: MockConfigFile = {
            endpoints: configEndpoints || {},
            outputDir,
            specSource,
            lastGenerated: new Date().toISOString(),
          };

          const selectedSet = new Set(
            Object.entries((configEndpoints || {}) as Record<string, { enabled?: boolean }>)
              .filter(([, v]) => v.enabled)
              .map(([k]) => k),
          );

          await generateApi(specSource, servicesDir, undefined, undefined, {
            msw: true,
            mswOutputDir: resolvedOutputDir,
            mswEndpointFilter: selectedSet.size > 0 ? selectedSet : undefined,
            mswEndpointConfigs: configEndpoints || {},
          });

          saveMockConfig(mockConfig, cwd);

          jsonResponse(res, {
            ok: true,
            outputDir: resolvedOutputDir,
            handlersGenerated: selectedSet.size,
          });
          return;
        }

        if (req.method === "GET" && pathname === "/api/mock-server") {
          jsonResponse(res, {
            running: mockServer !== null,
            port: mockServerPort,
          });
          return;
        }

        if (req.method === "POST" && pathname === "/api/mock-server") {
          const body = await parseBody(req);
          const { action, port } = JSON.parse(body);

          if (action === "start") {
            if (mockServer) {
              jsonResponse(res, {
                ok: true,
                port: mockServerPort,
                running: true,
              });
              return;
            }
            const targetPort = port || mockServerPort;
            try {
              await startMockServerInternal(cwd, targetPort);
              const cfg = loadMockConfig(cwd) as MockConfigFile & Record<string, unknown>;
              cfg.mockServerPort = mockServerPort;
              saveMockConfig(cfg, cwd);
              jsonResponse(res, {
                ok: true,
                port: mockServerPort,
                running: true,
              });
            } catch (err) {
              jsonResponse(
                res,
                { error: (err as Error).message },
                500,
              );
            }
            return;
          }

          if (action === "stop") {
            stopMockServerInternal();
            jsonResponse(res, { ok: true, running: false });
            return;
          }

          jsonResponse(
            res,
            { error: "Invalid action. Use 'start' or 'stop'" },
            400,
          );
          return;
        }

        if (req.method === "POST" && pathname === "/api/proxy") {
          const body = await parseBody(req);
          const { proxyTarget, proxyEnabled } = JSON.parse(body);
          const cfg = loadMockConfig(cwd);
          if (proxyTarget !== undefined) cfg.proxyTarget = proxyTarget;
          if (proxyEnabled !== undefined) cfg.proxyEnabled = proxyEnabled;
          saveMockConfig(cfg, cwd);
          jsonResponse(res, { ok: true });
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

  server = serverInstance;

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

      resolve(serverInstance);
    });
  });
}

