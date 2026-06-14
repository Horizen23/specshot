import http from "http";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { loadSpec } from "../spec-loader";
import { generateApi } from "../generate";
import {
  loadMockConfig,
  saveMockConfig,
  endpointKey,
  type MockConfigFile,
  type MockEndpointEntry,
} from "../mock-config";
import { CONFIG_FILE } from "../constants";
import { flattenEndpoints, groupByTag } from "./mock";
import { mockJsonFromSchema } from "../msw-utils";
import type { OpenApiSpec } from "../types";

let server: http.Server | null = null;

let mockServer: http.Server | null = null;
let mockServerPort = 3457;
let mockServerRestartTimer: ReturnType<typeof setTimeout> | null = null;

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

function getMockServerDashboard(config: MockConfigFile): string {
  const eps = Object.values(config.endpoints || {});
  const enabled = eps.filter((e) => e.enabled);
  const epOptions = enabled.map((ep) =>
    `<option value="${ep.method}|${ep.path}">${ep.method} ${ep.path}</option>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>SpecShot Mock Server</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--orange:#d29922;--purple:#bc8cff;--radius:8px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0;margin:0}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:16px}
.topbar .logo{font-size:18px;font-weight:800}
.topbar .logo span{color:var(--muted);font-weight:400;font-size:14px;margin-left:4px}
.topbar .spacer{flex:1}
.topbar .badge{font-size:11px;padding:4px 10px;border-radius:12px;font-weight:600}
.topbar .badge.on{background:rgba(63,185,80,0.15);color:var(--green)}
.topbar .badge.off{background:rgba(139,148,158,0.15);color:var(--muted)}
.topbar a{color:var(--accent);text-decoration:none;font-size:13px;padding:6px 14px;border:1px solid var(--border);border-radius:var(--radius);transition:background .15s}
.topbar a:hover{background:var(--surface)}
.container{max-width:1000px;margin:0 auto;padding:24px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center}
.stat .num{font-size:32px;font-weight:800;letter-spacing:-1px}
.stat .label{font-size:11px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:1px}
.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.ep-list{display:flex;flex-direction:column;gap:6px}
.ep-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;display:flex;align-items:center;gap:12px;transition:background .15s}
.ep-card:hover{background:#1c2129}
.ep-card.off{opacity:0.45}
.ep-method{font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;min-width:52px;text-align:center;letter-spacing:0.5px}
.GET{background:rgba(63,185,80,0.15);color:var(--green)}
.POST{background:rgba(88,166,255,0.15);color:var(--accent)}
.PUT{background:rgba(210,153,34,0.15);color:var(--orange)}
.DELETE{background:rgba(248,81,73,0.15);color:var(--red)}
.PATCH{background:rgba(188,140,255,0.15);color:var(--purple)}
.ep-path{flex:1;font-family:'SF Mono',Fira Code,monospace;font-size:13px}
.ep-status{font-size:11px;font-weight:600;min-width:60px;text-align:right}
.ep-status.on{color:var(--green)}.ep-status.off{color:var(--muted)}
.ep-tags{display:flex;gap:4px}
.ep-tag{font-size:9px;padding:2px 6px;border-radius:4px;background:var(--bg);color:var(--muted)}
.test-block{margin-top:24px}
.test-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.test-row{display:flex;gap:8px;margin-bottom:10px;align-items:center}
.test-row label{font-size:11px;color:var(--muted);min-width:44px}
select,input,textarea{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px 12px;font-size:12px;font-family:'SF Mono',Fira Code,monospace;outline:none;transition:border-color .15s}
select:focus,input:focus,textarea:focus{border-color:var(--accent)}
select{min-width:100px}
textarea{width:100%;min-height:56px;resize:vertical}
.btn{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px 18px;font-size:12px;cursor:pointer;font-weight:600;transition:all .15s}
.btn:hover{background:#1c2129;border-color:var(--accent)}
.btn.primary{background:#238636;border-color:#238636;color:#fff}
.btn.primary:hover{background:#2ea043}
.response-panel{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:14px;margin-top:10px;min-height:40px}
.response-status{font-weight:700;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.response-time{font-size:11px;color:var(--muted);font-weight:400}
.response-body{font-family:'SF Mono',Fira Code,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow:auto;color:var(--text)}
.response-body:empty::after{content:'(empty)';color:var(--muted)}
.footer{padding:14px 24px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);display:flex;align-items:center;gap:12px}
.footer .dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:768px){.two-col{grid-template-columns:1fr}.stats{grid-template-columns:1fr}}
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">⚡ SpecShot <span>Mock Server</span></div>
  <div class="spacer"></div>
  <span class="badge on">${enabled.length} active</span>
  <span class="badge off">${eps.length - enabled.length} passthrough</span>
  <a href="http://localhost:3456">⚙ Dashboard</a>
</div>

<div class="container">
<div class="two-col">
<div>

<div class="stats">
  <div class="stat"><div class="num" style="color:var(--green)">${enabled.length}</div><div class="label">Active Mocks</div></div>
  <div class="stat"><div class="num" style="color:var(--muted)">${eps.length - enabled.length}</div><div class="label">Passthrough</div></div>
  <div class="stat"><div class="num" style="color:var(--accent)">${eps.length}</div><div class="label">Total Endpoints</div></div>
</div>

<div class="section-title">Endpoints</div>
<div class="ep-list">
${eps.map((ep) => `
<div class="ep-card${ep.enabled ? '' : ' off'}">
  <span class="ep-method ${ep.method}">${ep.method}</span>
  <span class="ep-path">${ep.path}</span>
  <span class="ep-status ${ep.enabled ? 'on' : 'off'}">${ep.enabled ? '✓ ' + (ep.errorEnabled ? (ep.errorStatus||500) : (ep.statusCode||200)) : '✗'}</span>
  <div class="ep-tags">
    ${ep.errorEnabled ? '<span class="ep-tag" style="color:var(--red)">error</span>' : ''}
    ${ep.delay ? '<span class="ep-tag">'+ep.delay+'ms</span>' : ''}
  </div>
</div>
`).join('')}
${eps.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--muted)">No endpoints configured. Open <a href="http://localhost:3456" style="color:var(--accent)">dashboard</a> to set up mocks.</div>' : ''}
</div>

</div>
<div>

<div class="section-title">🧪 Test API</div>
<div class="test-panel">
  <div class="test-row">
    <select id="method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option></select>
    <select id="endpoint" style="flex:1" onchange="var v=this.value.split('|');document.getElementById('method').value=v[0];document.getElementById('path').value=v[1]||''">
      <option value="">— pick endpoint —</option>
      ${epOptions}
      <option value="GET|">— custom —</option>
    </select>
  </div>
  <div class="test-row">
    <label>Path</label>
    <input id="path" style="flex:1" placeholder="/pets/123" value="${enabled[0]?.path || '/pets'}">
  </div>
  <div class="test-row">
    <label>Body</label>
    <textarea id="body" placeholder='{"name":"Rex","age":3}'></textarea>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn primary" onclick="sendRequest()">▶ Send</button>
    <button class="btn" onclick="document.getElementById('response').innerHTML=''">Clear</button>
  </div>
  <div id="response" class="response-panel"></div>
</div>

</div>
</div>
</div>

<div class="footer">
  <div class="dot"></div>
  Mock server running at <strong>localhost:3457</strong>
  <span style="flex:1"></span>
  Configure: <a href="http://localhost:3456" style="color:var(--accent)">localhost:3456</a>
</div>

<script>
async function sendRequest() {
  var method = document.getElementById('method').value;
  var path = document.getElementById('path').value;
  var bodyVal = document.getElementById('body').value;
  var opts = { method: method, headers: {} };
  if (bodyVal && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = bodyVal;
  }
  var start = performance.now();
  var panel = document.getElementById('response');
  panel.style.display = 'block';
  panel.innerHTML = '<span style="color:#8b949e">Sending '+method+' '+path+'...</span>';
  try {
    var res = await fetch(path, opts);
    var data = await res.json();
    var ms = Math.round(performance.now() - start);
    var color = res.status >= 400 ? '#f85149' : '#3fb950';
    panel.innerHTML = '<div class="response-status" style="color:'+color+'">'+res.status+' '+res.statusText+' · '+ms+'ms</div><div class="response-body">'+JSON.stringify(data,null,2)+'</div>';
  } catch(e) {
    panel.innerHTML = '<div style="color:#f85149">Error: '+e.message+'</div>';
  }
}
</script>
</body>
</html>`;
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
    if (requestMethod === "GET" && requestPath === "/") {
      const config = loadMockConfig(cwd);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getMockServerDashboard(config));
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
}): Promise<http.Server> {
  const cwd = process.cwd();
  const port = options.port || 3456;

  const existingConfig = loadMockConfig(cwd);
  mockServerPort =
    (existingConfig as any).mockServerPort || 3457;

  const initialSpecSource = options.file || options.url || "";
  const initialOutputDir = options.output || "";

  // Pre-load spec at startup so browser doesn't need to fetch it
  let preloadedSpecData: string | null = null;
  if (initialSpecSource) {
    try {
      const resolvedSource =
        initialSpecSource.startsWith("http://") ||
        initialSpecSource.startsWith("https://")
          ? initialSpecSource
          : path.resolve(cwd, initialSpecSource);
      const spec = await loadSpec(resolvedSource);
      const schemas = spec.components?.schemas || {};
      const endpoints = flattenEndpoints(spec);
      const groupedByTag = groupByTag(endpoints);
      const tags = Array.from(groupedByTag.entries()).map(([tag, eps]) => ({
        tag,
        count: eps.length,
        endpoints: eps.map((ep) => ({
          ...ep,
          mockExample: mockJsonFromSchema(ep.responseSchema, schemas),
        })),
      }));
      preloadedSpecData = JSON.stringify({
        specSource: resolvedSource,
        tags,
        totalEndpoints: endpoints.length,
      });
      console.log(
        `Pre-loaded spec: ${tags.length} tags, ${endpoints.length} endpoints`,
      );
    } catch (e) {
      console.error(`Failed to pre-load spec: ${(e as Error).message}`);
    }
  }

  const serverInstance = http.createServer(
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        const pathname = url.pathname;

        if (req.method === "GET" && pathname === "/") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            getDashboardHtml(
              initialSpecSource,
              initialOutputDir,
              preloadedSpecData,
            ),
          );
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
          const config = loadMockConfig(cwd);
          (config as any).mockServerPort = mockServerPort;
          (config as any).mockServerRunning = mockServer !== null;
          jsonResponse(res, config);
          return;
        }

        if (req.method === "POST" && pathname === "/api/config") {
          const body = await parseBody(req);
          const config: MockConfigFile = JSON.parse(body);
          (config as any).mockServerPort = mockServerPort;
          saveMockConfig(config, cwd);
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
            Object.entries(configEndpoints || {})
              .filter(([, v]: [string, any]) => v.enabled)
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
              const cfg = loadMockConfig(cwd);
              (cfg as any).mockServerPort = mockServerPort;
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

function getDashboardHtml(
  initialSpecSource?: string,
  initialOutputDir?: string,
  preloadedSpecData?: string | null,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SpecShot — Mock Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #1c2129;
    --surface-3: #21262d;
    --border: #30363d;
    --text: #c9d1d9;
    --text-muted: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --blue: #58a6ff;
    --orange: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
    --radius: 8px;
    --transition: 150ms ease;
  }

  body {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* TOP BAR */
  .topbar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    z-index: 10;
  }
  .topbar .logo {
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
    white-space: nowrap;
  }
  .topbar .logo span { color: var(--text-muted); font-weight: 400; }
  .topbar .spacer { flex: 1; }
  .topbar input[type="text"] {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: var(--radius);
    font-family: inherit;
    font-size: 13px;
    width: 320px;
    outline: none;
    transition: border var(--transition);
  }
  .topbar input[type="text"]:focus { border-color: var(--accent); }
  .btn {
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 16px;
    border-radius: var(--radius);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    white-space: nowrap;
    transition: all var(--transition);
  }
  .btn:hover { background: var(--accent); border-color: var(--accent); }
  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .mock-server-btn { background: var(--surface-3); }
  .mock-server-btn.running { background: var(--green); border-color: var(--green); color: #000; }
  .mock-server-status { font-size: 11px; color: var(--text-muted); white-space: nowrap; padding: 0 4px; }
  .output-label {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .output-label input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: var(--radius);
    font-family: inherit;
    font-size: 12px;
    width: 200px;
    outline: none;
  }
  .output-label input:focus { border-color: var(--accent); }

  /* SEARCH */
  .search-bar {
    flex-shrink: 0;
    padding: 8px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .search-bar input[type="text"] {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 12px;
    border-radius: var(--radius);
    font-family: inherit;
    font-size: 13px;
    flex: 1;
    max-width: 480px;
    outline: none;
    transition: border var(--transition);
  }
  .search-bar input[type="text"]:focus { border-color: var(--accent); }
  .search-clear-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 16px;
    padding: 0 4px;
    line-height: 1;
    display: none;
    transition: color var(--transition);
  }
  .search-clear-btn.visible { display: inline; }
  .search-clear-btn:hover { color: var(--text); }
  .search-info {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .save-indicator {
    font-size: 11px;
    color: var(--green);
    opacity: 0;
    transition: opacity 0.3s ease;
    white-space: nowrap;
  }
  .save-indicator.visible { opacity: 1; }
  .mock-only-toggle { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); cursor: pointer; white-space: nowrap; margin-left: 8px; }
  .mock-only-toggle input { accent-color: var(--accent); }
  .mock-only-toggle:has(input:checked) { color: var(--accent); }

  /* MAIN */
  .main {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .main .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: var(--text-muted);
  }
  .main .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
  .main .empty-state p { font-size: 14px; margin-bottom: 8px; }

  /* ACCORDION SECTIONS */
  .tag-section {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 8px;
    overflow: hidden;
    background: var(--surface);
    transition: border-color var(--transition);
  }
  .tag-section.expanded { border-color: var(--surface-3); }
  .tag-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    cursor: pointer;
    user-select: none;
    transition: background var(--transition);
  }
  .tag-section-header:hover { background: var(--surface-2); }
  .tag-section .chevron {
    font-size: 12px;
    color: var(--text-muted);
    transition: transform 0.2s ease;
    display: inline-block;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }
  .tag-section.expanded .chevron { transform: rotate(90deg); }
  .tag-section-header .tag-name {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }
  .tag-section-header .tag-count {
    font-size: 12px;
    background: var(--surface-3);
    padding: 2px 10px;
    border-radius: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .tag-section-body {
    display: none;
    padding: 0 16px 16px 16px;
  }
  .tag-section.expanded .tag-section-body { display: block; }

  /* SELECT ALL BUTTONS (in batch toolbar) */
  .select-all-btn {
    font-size: 11px;
    padding: 4px 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition);
    white-space: nowrap;
  }
  .select-all-btn:hover { border-color: var(--accent); }

  /* SUMMARY BAR & BATCH TOOLBAR */
  .summary-bar {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .summary-stat {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .summary-stat .stat-value { font-weight: 700; color: var(--accent); }
  .summary-stat .stat-label { color: var(--text-muted); }
  .summary-stat .stat-value.green { color: var(--green); }
  .summary-stat .stat-value.orange { color: var(--orange); }
  .batch-toolbar {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    margin-bottom: 16px;
    display: none;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    animation: fadeIn 0.2s ease;
  }
  .batch-toolbar.visible { display: flex; }
  .batch-toolbar .batch-label { color: var(--text-muted); margin-right: 4px; }
  .batch-btn {
    font-size: 11px;
    padding: 4px 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition);
    white-space: nowrap;
  }
  .batch-btn:hover { background: var(--accent); border-color: var(--accent); }
  .batch-btn.danger:hover { background: var(--red); border-color: var(--red); }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ENDPOINT CARD */
  .ep-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 8px;
    transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition);
  }
  .ep-card:hover { border-color: var(--surface-3); transform: translateX(2px); }
  .ep-card:focus-within { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .ep-card.mocked { border-color: var(--accent); }
  .ep-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
  }
  .ep-card-header:hover { background: rgba(255,255,255,0.02); }
  .method-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    min-width: 56px;
    text-align: center;
  }
  .method-badge.get { background: linear-gradient(135deg, rgba(0,200,83,0.25), rgba(0,200,83,0.08)); color: var(--green); }
  .method-badge.post { background: linear-gradient(135deg, rgba(68,138,255,0.25), rgba(68,138,255,0.08)); color: var(--blue); }
  .method-badge.put { background: linear-gradient(135deg, rgba(255,145,0,0.25), rgba(255,145,0,0.08)); color: var(--orange); }
  .method-badge.delete { background: linear-gradient(135deg, rgba(255,23,68,0.25), rgba(255,23,68,0.08)); color: var(--red); }
  .method-badge.patch { background: linear-gradient(135deg, rgba(124,77,255,0.25), rgba(124,77,255,0.08)); color: var(--purple); }

  .ep-path {
    font-size: 14px;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ep-summary {
    font-size: 11px;
    color: var(--text-muted);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* TOGGLE SWITCH */
  .toggle {
    position: relative;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .toggle input { display: none; }
  .toggle .slider {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: var(--surface-3);
    border-radius: 12px;
    transition: background 0.2s ease;
  }
  .toggle .slider::before {
    content: '';
    position: absolute;
    width: 18px; height: 18px;
    top: 3px; left: 3px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: transform 0.2s ease, background 0.2s ease;
  }
  .toggle input:checked + .slider { background: var(--accent); }
  .toggle input:checked + .slider::before {
    transform: translateX(20px);
    background: #fff;
  }
  .toggle:active .slider::before { width: 22px; }

  /* EXPANDABLE CONFIG */
  .ep-config {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
    max-height: 0;
    border-top: 1px solid transparent;
    padding: 0 16px;
    transition: max-height 0.3s ease, padding 0.3s ease, border-color 0.3s ease;
  }
  .ep-card.expanded .ep-config {
    max-height: 600px;
    border-top-color: var(--border);
    padding: 16px;
  }
  .config-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .config-tab { background: none; border: none; color: var(--text-muted); padding: 8px 16px; font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent; }
  .config-tab:hover { color: var(--text); }
  .config-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-badge { font-size: 10px; color: var(--text-muted); background: var(--surface-3); padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
  .tab-panel { display: none; flex-direction: column; gap: 12px; }
  .tab-panel.active { display: flex; }

  .expand-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    padding: 8px 10px;
    transition: transform 0.25s ease, color 0.15s;
    line-height: 1;
    border-radius: var(--radius);
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .expand-btn:hover { color: var(--text); }
  .ep-card.expanded .expand-btn { transform: rotate(180deg); }
  .config-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .config-row label {
    font-size: 12px;
    color: var(--text-muted);
    min-width: 80px;
  }
  .config-row input[type="number"] {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: var(--radius);
    font-family: inherit;
    font-size: 13px;
    width: 80px;
    outline: none;
  }
  .config-row input[type="number"]:focus { border-color: var(--accent); }
  .config-row input[type="range"] {
    flex: 1;
    max-width: 200px;
    accent-color: var(--accent);
  }
  .code-editor {
    display: flex;
    background: #0d1117;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 100%;
    min-height: 80px;
  }
  .code-editor:focus-within { border-color: var(--accent); }
  .code-editor.valid { border-color: #3fb950; }
  .code-editor.invalid { border-color: #f85149; }
  .code-body-wrap { position: relative; width: 100%; }
  .copy-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
    z-index: 3;
    transition: all var(--transition);
    opacity: 0;
  }
  .code-body-wrap:hover .copy-btn { opacity: 1; }
  .copy-btn:hover { color: var(--text); border-color: var(--accent); }
  .copy-btn.copied { color: var(--green); border-color: var(--green); }
  .code-editor .code-body {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  .code-editor pre,
  .code-editor textarea {
    margin: 0;
    padding: 10px 12px;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    tab-size: 2;
    border: none;
    outline: none;
    background: transparent;
  }
  .code-editor pre {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    color: #c9d1d9;
  }
  .code-editor pre code { font: inherit; }
  .code-editor textarea {
    position: relative;
    z-index: 1;
    color: transparent;
    caret-color: var(--accent);
    resize: vertical;
    width: 100%;
    min-height: 80px;
  }
  .code-editor textarea::selection { background: rgba(88,166,255,0.3); }
  .hl-k { color: #79c0ff; }
  .hl-s { color: #a5d6ff; }
  .hl-n { color: #79c0ff; }
  .hl-b { color: #ff7b72; }
  .hl-p { color: #8b949e; }

  .error-body-input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius);
    padding: 6px 10px;
    font-family: monospace;
    font-size: 12px;
    width: 100%;
    resize: vertical;
    outline: none;
    min-height: 40px;
  }
  .error-body-input:focus { border-color: var(--accent); }

  .line-numbers {
    padding: 10px 8px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-muted);
    text-align: right;
    user-select: none;
    min-width: 32px;
    border-right: 1px solid var(--border);
    background: #0d1117;
    white-space: pre;
  }
  .mock-data-row { flex-direction: column; align-items: stretch; }
  .mock-data-row > label { margin-bottom: 4px; }
  .json-status {
    font-size: 11px;
    margin-top: 4px;
    min-height: 16px;
  }
  .json-status.valid { color: #3fb950; }
  .json-status.invalid { color: #f85149; }
  .delay-value {
    font-size: 12px;
    color: var(--text-muted);
    min-width: 60px;
    text-align: right;
  }

  /* NOTIFICATIONS */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    padding: 12px 20px;
    border-radius: var(--radius);
    font-size: 13px;
    animation: slideInUp 0.3s ease;
    z-index: 100;
  }
  .toast.removing { animation: slideOutDown 0.3s ease forwards; }
  .toast.success { border-color: var(--green); }
  .toast.error { border-color: var(--red); }

  @keyframes slideInUp {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideOutDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(100%); opacity: 0; }
  }

  /* LOADING */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @keyframes celebrate {
    0% { transform: scale(1); }
    40% { transform: scale(1.03); }
    70% { transform: scale(0.98); }
    100% { transform: scale(1); }
  }
  .celebrate { animation: celebrate 0.5s ease; }

  button:focus-visible, input:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .topbar { flex-wrap: wrap; padding: 10px 14px; gap: 8px; }
    .topbar input[type="text"] { width: 100%; }
    .output-label { display: none; }
    .main { padding: 12px; }
    .ep-summary { display: none; }
  }
</style>
</head>
<body>

<div id="topbar" class="topbar">
  <div class="logo">⚡ SpecShot <span>Mock</span></div>
  <input type="text" id="specSource" placeholder="OpenAPI URL or file path (e.g. ./petstore.json)" value="${initialSpecSource || ""}" />
  <button class="btn" id="loadBtn">Load Spec</button>
  <span class="save-indicator" id="saveIndicator">Saved</span>
  <div class="spacer"></div>
  <button class="btn mock-server-btn" id="mockServerBtn" title="Start Mock Server">▶ Start Mock Server</button>
  <span class="mock-server-status" id="mockServerStatus"></span>
  <div class="output-label">
    Output: <input type="text" id="outputDir" placeholder="src/mocks/handlers" value="${initialOutputDir || ""}" />
  </div>
  <button class="btn btn-primary" id="generateBtn" disabled>Generate Handlers</button>
</div>

<div class="search-bar" id="searchBar">
  <input type="text" id="searchInput" placeholder="Filter endpoints by path, method, summary..." />
  <button class="search-clear-btn" id="searchClearBtn" title="Clear search">&times;</button>
  <span class="search-info" id="searchInfo"></span>
  <label class="mock-only-toggle">
    <input type="checkbox" id="mockOnlyCheck" />
    <span>Mocked only</span>
  </label>
</div>

<div class="main" id="main">
  <div class="summary-bar" id="summaryBar" style="display:none"></div>
  <div class="batch-toolbar" id="batchToolbar">
    <span class="batch-label">Batch:</span>
    <button class="select-all-btn" id="selectAllBtn">Select All</button>
    <button class="select-all-btn" id="deselectAllBtn">Deselect All</button>
    <button class="batch-btn" id="batchEnableAll">Enable All</button>
    <button class="batch-btn" id="batchDisableAll">Disable All</button>
    <button class="batch-btn danger" id="batchStatus500">Set Status 500</button>
    <button class="batch-btn danger" id="batchStatus200">Set Status 200</button>
  </div>
  <div id="endpointList">
    <div class="empty-state">
      <div class="icon">📡</div>
      <p>Enter an OpenAPI spec source above and click <strong>Load Spec</strong></p>
      <p style="font-size:12px;color:var(--text-muted)">Supports URLs (http://, https://) or local file paths</p>
    </div>
  </div>
</div>

<script>
${
  preloadedSpecData
    ? `var __PRELOADED_SPEC__ = ${preloadedSpecData};
`
    : ""
}(function() {
  let currentData = null;
  let endpointConfigs = {};
  let searchText = '';
  let dirty = false;
  let saveTimer = null;
  let expandedKeys = new Set();
  let expandedTags = new Set();
  let mockOnly = false;
  let mockServerRunning = false;
  let msPort = 3457;

  const specSourceInput = document.getElementById('specSource');
  const outputDirInput = document.getElementById('outputDir');
  const loadBtn = document.getElementById('loadBtn');
  const generateBtn = document.getElementById('generateBtn');
  const endpointListEl = document.getElementById('endpointList');
  const summaryBarEl = document.getElementById('summaryBar');
  const batchToolbarEl = document.getElementById('batchToolbar');
  const searchInput = document.getElementById('searchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const searchInfo = document.getElementById('searchInfo');
  const saveIndicator = document.getElementById('saveIndicator');
  const mockOnlyCheck = document.getElementById('mockOnlyCheck');
  const mainEl = document.getElementById('main');
  const mockServerBtn = document.getElementById('mockServerBtn');
  const mockServerStatusEl = document.getElementById('mockServerStatus');

  function toast(msg, type) {
    type = type || '';
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() {
      el.classList.add('removing');
      setTimeout(function() { el.remove(); }, 300);
    }, 2800);
  }

  function showSpinner(el) {
    el.innerHTML = '<span class="spinner"></span>';
    el.disabled = true;
  }

  function hideSpinner(el, text) {
    el.innerHTML = '';
    el.disabled = false;
    if (text) el.textContent = text;
  }

  async function loadSpec() {
    const source = specSourceInput.value.trim();
    if (!source) { toast('Enter a spec source', 'error'); return; }

    showSpinner(loadBtn);
    try {
      const resp = await fetch('/api/spec?source=' + encodeURIComponent(source));
      const data = await resp.json();
      if (!resp.ok) { toast(data.error || 'Failed to load spec', 'error'); return; }

      currentData = data;
      endpointConfigs = {};

      data.tags.forEach(function(t) {
        t.endpoints.forEach(function(ep) {
          endpointConfigs[ep.key] = {
            enabled: ep.enabled || false,
            tag: ep.tag,
            operationId: ep.operationId,
            method: ep.method,
            path: ep.path,
            statusCode: (ep.config && ep.config.statusCode) || defaultStatusCode(ep.method),
            delay: (ep.config && ep.config.delay) || 0,
            mockData: (ep.config && ep.config.mockData) || ''
          };
        });
      });

      renderEndpoints();
      generateBtn.disabled = false;
      toast('Loaded ' + data.totalEndpoints + ' endpoints', 'success');
      celebrateLoad();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      hideSpinner(loadBtn, 'Load Spec');
    }
  }

  function defaultStatusCode(method) {
    if (method === 'POST') return 201;
    if (method === 'DELETE') return 204;
    return 200;
  }

  function getFilteredEndpoints() {
    if (!currentData) return [];
    var eps = [];
    currentData.tags.forEach(function(t) { eps = eps.concat(t.endpoints); });
    if (searchText) {
      var q = searchText.toLowerCase();
      eps = eps.filter(function(ep) {
        return (ep.path && ep.path.toLowerCase().indexOf(q) !== -1) ||
               (ep.method && ep.method.toLowerCase().indexOf(q) !== -1) ||
               (ep.summary && ep.summary.toLowerCase().indexOf(q) !== -1) ||
               (ep.operationId && ep.operationId.toLowerCase().indexOf(q) !== -1);
      });
    }
    return eps;
  }

  function enabledInTag(tag) {
    if (!currentData) return 0;
    var td = currentData.tags.find(function(t) { return t.tag === tag; });
    if (!td) return 0;
    var count = 0;
    td.endpoints.forEach(function(ep) {
      var cfg = endpointConfigs[ep.key] || {};
      if (cfg.enabled) count++;
    });
    return count;
  }

  function getExpandedFilteredEndpoints() {
    var allFiltered = getFilteredEndpoints();
    if (expandedTags.size === 0) return allFiltered;
    return allFiltered.filter(function(ep) {
      return expandedTags.has(ep.tag);
    });
  }

  function showEmptyPrompt() {
    summaryBarEl.style.display = 'none';
    batchToolbarEl.classList.remove('visible');
    searchInfo.textContent = '';
    endpointListEl.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No spec loaded</p><p style="font-size:12px;color:var(--text-muted)">Enter a source above and click <strong>Load Spec</strong></p></div>';
    mainEl.scrollTop = 0;
  }

  function renderEndpoints() {
    if (!currentData) {
      showEmptyPrompt();
      return;
    }

    var eps = getFilteredEndpoints();

    expandedCards = new Set();
    endpointListEl.querySelectorAll('.ep-card.expanded').forEach(function(card) {
      expandedCards.add(card.getAttribute('data-key'));
    });

    var scrollTop = mainEl.scrollTop;

    updateSummaryBar(eps);
    updateBatchToolbar();
    updateSearchInfo(eps);

    if (eps.length === 0) {
      endpointListEl.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>No endpoints match your search</p><p style="font-size:12px;color:var(--text-muted)">Try a different search term</p></div>';
      mainEl.scrollTop = 0;
      return;
    }

    var grouped = {};
    eps.forEach(function(ep) {
      if (!grouped[ep.tag]) grouped[ep.tag] = [];
      grouped[ep.tag].push(ep);
    });

    var tagOrder = [];
    if (currentData.tags) {
      currentData.tags.forEach(function(t) { tagOrder.push(t.tag); });
    }
    Object.keys(grouped).forEach(function(tag) {
      if (tagOrder.indexOf(tag) === -1) tagOrder.push(tag);
    });

    var html = '';
    tagOrder.forEach(function(tag) {
      var tagEps = grouped[tag];
      if (!tagEps) return;

      if (mockOnly) {
        tagEps = tagEps.filter(function(ep) {
          var cfg = endpointConfigs[ep.key] || {};
          return cfg.enabled;
        });
        if (tagEps.length === 0) return;
      }

      var isExpanded = searchText ? true : expandedTags.has(tag);

      html += '<div class="tag-section' + (isExpanded ? ' expanded' : '') + '" data-tag="' + tag + '">';
      html += '<div class="tag-section-header">';
      html += '<span class="chevron">▶</span>';
      html += '<span class="tag-name">' + tag + '</span>';
      html += '<span class="tag-count">' + (mockOnly ? tagEps.length : (enabledInTag(tag) + '/' + grouped[tag].length)) + '</span>';
      html += '</div>';
      html += '<div class="tag-section-body">';
      tagEps.forEach(function(ep) { html += renderEpCard(ep); });
      html += '</div>';
      html += '</div>';
    });
    endpointListEl.innerHTML = html;

    attachCardListeners();
    attachAccordionListeners();

    if (expandedCards.size > 0) {
      endpointListEl.querySelectorAll('.ep-card').forEach(function(card) {
        var key = card.getAttribute('data-key');
        if (expandedCards.has(key)) {
          card.classList.add('expanded');
        }
      });
    }

    mainEl.scrollTop = scrollTop;
  }

  function renderEpCard(ep) {
    var cfg = endpointConfigs[ep.key] || {};
    var mocked = cfg.enabled;
    var methodLower = ep.method.toLowerCase();
    var statusCode = cfg.statusCode || defaultStatusCode(ep.method);
    var delayMs = cfg.delay || 0;
    var mockDataVal = cfg.mockData || '';

    var html = '<div class="ep-card' + (mocked ? ' mocked' : '') + '" data-key="' + ep.key + '">';
    html += '<div class="ep-card-header">';

    html += '<label class="toggle">';
    html += '<input type="checkbox" ' + (mocked ? 'checked' : '') + ' class="mock-toggle" />';
    html += '<span class="slider"></span>';
    html += '</label>';

    html += '<span class="method-badge ' + methodLower + '">' + ep.method + '</span>';
    html += '<span class="ep-path">' + ep.path + '</span>';
    html += '<span class="ep-summary" title="' + (ep.summary || '') + '">' + (ep.summary || '') + '</span>';
    html += '<button class="expand-btn" title="Configure">&#9881;</button>';
    html += '</div>';

    html += '<div class="ep-config">';

    var errEnabled = cfg.errorEnabled || false;
    var errStatus = cfg.errorStatus || 500;
    var errBody = cfg.errorBody || '';
    var activeTab = cfg.activeTab || 'success';

    html += '<div class="config-tabs">';
    html += '<button class="config-tab' + (activeTab === 'success' ? ' active' : '') + '" data-tab="success">Success</button>';
    html += '<button class="config-tab' + (activeTab === 'error' ? ' active' : '') + '" data-tab="error">Error</button>';
    html += '</div>';

    html += '<div class="tab-panel' + (activeTab === 'success' ? ' active' : '') + '" data-panel="success">';
    html += '<div class="config-row">';
    html += '<label>Status Code</label>';
    html += '<input type="number" class="status-input" value="' + statusCode + '" min="100" max="599" />';
    html += '</div>';
    html += '<div class="config-row">';
    html += '<label>Delay (ms)</label>';
    html += '<input type="range" class="delay-range" value="' + delayMs + '" min="0" max="5000" step="100" />';
    html += '<span class="delay-value">' + delayMs + 'ms</span>';
    html += '</div>';
    html += '<div class="config-row mock-data-row">';
    html += '<label>Mock Data</label>';
    html += '<div class="code-body-wrap">';
    html += '<button class="copy-btn" title="Copy mock data">Copy</button>';
    html += '<div class="code-editor">';
    html += '<div class="line-numbers" data-lines=""></div>';
    html += '<div class="code-body">';
    html += '<pre><code></code></pre>';
    html += '<textarea class="mock-data-input" placeholder="Leave blank for auto-generated mock data" rows="5" spellcheck="false">' + (mockDataVal || '') + '</textarea>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<span class="json-status"></span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="tab-panel' + (activeTab === 'error' ? ' active' : '') + '" data-panel="error">';
    html += '<div class="config-row">';
    html += '<label>Error Status</label>';
    html += '<input type="number" class="error-status-input" value="' + errStatus + '" min="400" max="599" />';
    html += '</div>';
    html += '<div class="config-row mock-data-row">';
    html += '<label>Error Body</label>';
    html += '<textarea class="error-body-input" placeholder="{ &quot;message&quot;: &quot;Something went wrong&quot; }" rows="2">' + (errBody || '') + '</textarea>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    html += '</div>';

    return html;
  }

  function highlightJson(text) {
    if (!text) return '';
    var out = '';
    var i = 0;
    var len = text.length;
    while (i < len) {
      var ch = text[i];
      // string
      if (ch === '"') {
        var j = i + 1;
        while (j < len && text[j] !== '"') {
          if (text[j] === '\\\\') j++;
          j++;
        }
        if (j < len) j++;
        var str = text.substring(i, j);
        // check if followed by colon (key)
        var k = j;
        while (k < len && (text[k] === ' ' || text[k] === String.fromCharCode(9))) k++;
        if (text[k] === ':') {
          out += '<span class="hl-k">' + esc(str) + '</span>';
        } else {
          out += '<span class="hl-s">' + esc(str) + '</span>';
        }
        i = j;
        continue;
      }
      // number
      if ((ch === '-' && i+1 < len && text[i+1] >= '0' && text[i+1] <= '9') || (ch >= '0' && ch <= '9')) {
        var j2 = i;
        if (text[j2] === '-') j2++;
        while (j2 < len && ((text[j2] >= '0' && text[j2] <= '9') || text[j2] === '.' || text[j2] === 'e' || text[j2] === 'E' || text[j2] === '+' || text[j2] === '-')) j2++;
        out += '<span class="hl-n">' + esc(text.substring(i, j2)) + '</span>';
        i = j2;
        continue;
      }
      // true/false/null
      if (text.substring(i, i+4) === 'true' && !/[a-zA-Z0-9_]/.test(text[i+4]||'')) {
        out += '<span class="hl-b">true</span>'; i += 4; continue;
      }
      if (text.substring(i, i+5) === 'false' && !/[a-zA-Z0-9_]/.test(text[i+5]||'')) {
        out += '<span class="hl-b">false</span>'; i += 5; continue;
      }
      if (text.substring(i, i+4) === 'null' && !/[a-zA-Z0-9_]/.test(text[i+4]||'')) {
        out += '<span class="hl-b">null</span>'; i += 4; continue;
      }
      // brackets/punctuation
      if ('{}[]:,'.indexOf(ch) !== -1) {
        out += '<span class="hl-p">' + esc(ch) + '</span>';
        i++;
        continue;
      }
      // whitespace / other
      out += esc(ch);
      i++;
    }
    return out;
  }
  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function attachCardListeners() {
    endpointListEl.querySelectorAll('.ep-card').forEach(function(card) {
      var key = card.getAttribute('data-key');
      var cfg = endpointConfigs[key];
      if (!cfg) return;

      card.querySelector('.mock-toggle').addEventListener('change', function(e) {
        cfg.enabled = e.target.checked;
        if (cfg.enabled) {
          card.classList.add('mocked');
        } else {
          card.classList.remove('mocked');
        }
        updateSummaryBar(getFilteredEndpoints());
        markDirty();
      });

      card.querySelector('.expand-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        card.classList.toggle('expanded');
      });

      card.querySelector('.ep-card-header').addEventListener('click', function(e) {
        if (e.target.closest('.toggle') || e.target.closest('input')) return;
        card.classList.toggle('expanded');
      });

      card.querySelectorAll('.config-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          var panelName = tab.getAttribute('data-tab');
          cfg.activeTab = panelName;
          if (panelName === 'error') cfg.errorEnabled = true;
          card.querySelectorAll('.config-tab').forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          card.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
          card.querySelector('.tab-panel[data-panel="' + panelName + '"]').classList.add('active');
          markDirty();
        });
      });

      var copyBtn = card.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var textarea = card.querySelector('.mock-data-input');
          var text = textarea ? textarea.value : '';
          copyToClipboard(text, copyBtn);
        });
      }

      var statusInput = card.querySelector('.status-input');
      if (statusInput) {
        statusInput.addEventListener('change', function() {
          var v = parseInt(statusInput.value, 10);
          if (v >= 100 && v < 600) { cfg.statusCode = v; markDirty(); }
        });
      }

      var delayRange = card.querySelector('.delay-range');
      var delayValue = card.querySelector('.delay-value');
      if (delayRange && delayValue) {
        delayRange.addEventListener('input', function() {
          var v = parseInt(delayRange.value, 10);
          cfg.delay = v;
          delayValue.textContent = v + 'ms';
          markDirty();
        });
      }

      var mockDataInput = card.querySelector('.mock-data-input');
      var lineNumbers = card.querySelector('.line-numbers');
      var codeEditor = card.querySelector('.code-editor');
      var highlightCode = card.querySelector('.code-body pre code');
      var jsonStatus = card.querySelector('.json-status');

      function updateLineNumbers() {
        var NL = String.fromCharCode(10);
        var lines = mockDataInput.value.split(NL);
        var nums = '';
        for (var i = 1; i <= lines.length; i++) nums += i + NL;
        if (lineNumbers) lineNumbers.textContent = nums.trimEnd();
        mockDataInput.rows = Math.max(4, Math.min(lines.length, 20));
      }

      function refreshHighlight() {
        if (highlightCode) highlightCode.innerHTML = highlightJson(mockDataInput.value) + String.fromCharCode(10);
        var pre = highlightCode ? highlightCode.parentElement : null;
        if (pre) { pre.scrollTop = mockDataInput.scrollTop; pre.scrollLeft = mockDataInput.scrollLeft; }
      }

      function validateJson() {
        var val = mockDataInput.value.trim();
        if (!val) {
          if (codeEditor) codeEditor.classList.remove('valid','invalid');
          if (jsonStatus) { jsonStatus.textContent = ''; jsonStatus.className = 'json-status'; }
          return;
        }
        try {
          JSON.parse(val);
          if (codeEditor) { codeEditor.classList.add('valid'); codeEditor.classList.remove('invalid'); }
          if (jsonStatus) { jsonStatus.textContent = '✓ Valid JSON'; jsonStatus.className = 'json-status valid'; }
        } catch(e) {
          if (codeEditor) { codeEditor.classList.add('invalid'); codeEditor.classList.remove('valid'); }
          if (jsonStatus) { jsonStatus.textContent = '✗ ' + e.message; jsonStatus.className = 'json-status invalid'; }
        }
      }

      if (mockDataInput) {
        updateLineNumbers();
        refreshHighlight();
        validateJson();
        mockDataInput.addEventListener('input', function() {
          cfg.mockData = mockDataInput.value.trim();
          updateLineNumbers();
          refreshHighlight();
          validateJson();
          markDirty();
        });
        mockDataInput.addEventListener('scroll', refreshHighlight);
      }

      var errorStatusInput = card.querySelector('.error-status-input');
      var errorBodyInput = card.querySelector('.error-body-input');

      if (errorStatusInput) {
        errorStatusInput.addEventListener('change', function() {
          var v = parseInt(errorStatusInput.value, 10);
          if (v >= 400 && v < 600) { cfg.errorStatus = v; markDirty(); }
        });
      }
      if (errorBodyInput) {
        errorBodyInput.addEventListener('input', function() {
          cfg.errorBody = errorBodyInput.value;
          markDirty();
        });
      }
    });
  }

  function attachAccordionListeners() {
    endpointListEl.querySelectorAll('.tag-section-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var section = header.parentElement;
        var tag = section.getAttribute('data-tag');
        if (expandedTags.has(tag)) {
          expandedTags.delete(tag);
        } else {
          expandedTags.clear();
          expandedTags.add(tag);
        }
        renderEndpoints();
      });
    });
  }

  function collapseAllSections() {
    expandedTags.clear();
    endpointListEl.querySelectorAll('.ep-card.expanded').forEach(function(card) {
      card.classList.remove('expanded');
    });
    renderEndpoints();
  }

  function updateSearchInfo(filteredEps) {
    if (!currentData) {
      searchInfo.textContent = '';
      return;
    }
    var total = 0;
    currentData.tags.forEach(function(t) { total += t.endpoints.length; });
    if (searchText && filteredEps.length !== total) {
      searchInfo.textContent = 'Showing ' + filteredEps.length + ' of ' + total + ' endpoints';
    } else {
      searchInfo.textContent = '';
    }
  }

  function markDirty() {
    if (!currentData) return;
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(autoSave, 2000);
  }

  function autoSave() {
    saveTimer = null;
    if (!dirty || !currentData) return;
    var specSource = currentData.specSource;
    var outputDir = outputDirInput.value.trim() || 'src/mocks/handlers';

    var configEndpoints = {};
    Object.keys(endpointConfigs).forEach(function(k) {
      var c = endpointConfigs[k];
      if (!c) return;
      configEndpoints[k] = {
        enabled: c.enabled,
        tag: c.tag,
        operationId: c.operationId,
        method: c.method,
        path: c.path
      };
      if (c.statusCode !== defaultStatusCode(c.method)) configEndpoints[k].statusCode = c.statusCode;
      if (c.delay && c.delay > 0) configEndpoints[k].delay = c.delay;
      if (c.mockData) configEndpoints[k].mockData = c.mockData;
      if (c.errorEnabled) {
        configEndpoints[k].errorEnabled = true;
        configEndpoints[k].errorStatus = c.errorStatus || 500;
        configEndpoints[k].errorBody = c.errorBody || '';
      }
    });

    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoints: configEndpoints,
        outputDir: outputDir,
        specSource: specSource,
        lastGenerated: new Date().toISOString()
      })
    }).then(function(resp) {
      if (resp.ok) {
        dirty = false;
        saveIndicator.classList.add('visible');
        setTimeout(function() { saveIndicator.classList.remove('visible'); }, 2000);
      }
    });
  }

  function updateSummaryBar(filteredEps) {
    if (!currentData || !filteredEps) {
      summaryBarEl.style.display = 'none';
      return;
    }
    var total = 0;
    currentData.tags.forEach(function(t) { total += t.endpoints.length; });
    var enabled = 0;
    var errorEps = 0;
    filteredEps.forEach(function(ep) {
      var c = endpointConfigs[ep.key];
      if (c && c.enabled) enabled++;
      if (c && c.errorEnabled) errorEps++;
    });
    summaryBarEl.style.display = 'flex';
    summaryBarEl.innerHTML =
      '<span class="summary-stat"><span class="stat-value">' + enabled + '</span><span class="stat-label">of ' + total + ' endpoints enabled</span></span>' +
      '<span class="summary-stat"><span class="stat-label">Showing:</span> <span class="stat-value">' + filteredEps.length + '</span></span>' +
      '<span class="summary-stat"><span class="stat-label">Errors simulated:</span> <span class="stat-value orange">' + errorEps + '</span></span>';
  }

  function updateBatchToolbar() {
    if (!currentData) {
      batchToolbarEl.classList.remove('visible');
      return;
    }
    batchToolbarEl.classList.add('visible');
  }

  function selectAllFiltered() {
    var eps = getExpandedFilteredEndpoints();
    eps.forEach(function(ep) {
      if (endpointConfigs[ep.key]) endpointConfigs[ep.key].enabled = true;
    });
    markDirty();
    renderEndpoints();
    toast('Selected ' + eps.length + ' endpoints', 'success');
  }

  function deselectAllFiltered() {
    var eps = getExpandedFilteredEndpoints();
    eps.forEach(function(ep) {
      if (endpointConfigs[ep.key]) {
        endpointConfigs[ep.key].enabled = false;
        endpointConfigs[ep.key].errorEnabled = false;
      }
    });
    markDirty();
    renderEndpoints();
    toast('Deselected ' + eps.length + ' endpoints', 'success');
  }

  function batchSetStatus(statusCode) {
    var eps = getFilteredEndpoints();
    eps.forEach(function(ep) {
      if (endpointConfigs[ep.key]) endpointConfigs[ep.key].statusCode = statusCode;
    });
    markDirty();
    renderEndpoints();
    toast('Set status ' + statusCode + ' on ' + eps.length + ' endpoints', 'success');
  }

  function copyToClipboard(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    }
  }

  function celebrateLoad() {
    var main = document.getElementById('main');
    if (main) {
      main.classList.add('celebrate');
      setTimeout(function() { main.classList.remove('celebrate'); }, 500);
    }
  }

  function handleGenerate() {
    generateBtn.click();
  }

  function handleSaveConfig() {
    if (!currentData) return;
    var specSource = currentData.specSource;
    var outputDir = outputDirInput.value.trim() || 'src/mocks/handlers';

    var configEndpoints = {};
    Object.keys(endpointConfigs).forEach(function(k) {
      var c = endpointConfigs[k];
      configEndpoints[k] = {
        enabled: c.enabled,
        tag: c.tag,
        operationId: c.operationId,
        method: c.method,
        path: c.path
      };
      if (c.statusCode !== defaultStatusCode(c.method)) configEndpoints[k].statusCode = c.statusCode;
      if (c.delay && c.delay > 0) configEndpoints[k].delay = c.delay;
      if (c.mockData) configEndpoints[k].mockData = c.mockData;
      if (c.errorEnabled) {
        configEndpoints[k].errorEnabled = true;
        configEndpoints[k].errorStatus = c.errorStatus || 500;
        configEndpoints[k].errorBody = c.errorBody || '';
      }
    });

    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoints: configEndpoints,
        outputDir: outputDir,
        specSource: specSource,
        lastGenerated: new Date().toISOString()
      })
    }).then(function(resp) {
      if (resp.ok) {
        dirty = false;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        toast('Config saved', 'success');
      } else toast('Save failed', 'error');
    });
  }

  document.getElementById('selectAllBtn').addEventListener('click', selectAllFiltered);
  document.getElementById('deselectAllBtn').addEventListener('click', deselectAllFiltered);

  document.getElementById('batchEnableAll').addEventListener('click', function() {
    var eps = getFilteredEndpoints();
    eps.forEach(function(ep) { if (endpointConfigs[ep.key]) endpointConfigs[ep.key].enabled = true; });
    markDirty();
    renderEndpoints();
    toast('Enabled ' + eps.length + ' endpoints', 'success');
  });
  document.getElementById('batchDisableAll').addEventListener('click', function() {
    var eps = getFilteredEndpoints();
    eps.forEach(function(ep) { if (endpointConfigs[ep.key]) endpointConfigs[ep.key].enabled = false; });
    markDirty();
    renderEndpoints();
    toast('Disabled ' + eps.length + ' endpoints', 'success');
  });
  document.getElementById('batchStatus500').addEventListener('click', function() { batchSetStatus(500); });
  document.getElementById('batchStatus200').addEventListener('click', function() { batchSetStatus(200); });

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveConfig();
    }
    if (e.key === 'Escape') {
      var expandedCard = endpointListEl.querySelector('.ep-card.expanded');
      if (expandedCard) {
        expandedCard.classList.remove('expanded');
        e.preventDefault();
      } else if (expandedTags.size > 0) {
        collapseAllSections();
        e.preventDefault();
      }
    }
  });

  window.addEventListener('beforeunload', function(e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  searchInput.addEventListener('input', function() {
    searchText = searchInput.value.trim();
    if (searchText) {
      searchClearBtn.classList.add('visible');
    } else {
      searchClearBtn.classList.remove('visible');
      expandedTags.clear();
    }
    renderEndpoints();
  });
  searchClearBtn.addEventListener('click', function() {
    searchInput.value = '';
    searchText = '';
    searchClearBtn.classList.remove('visible');
    expandedTags.clear();
    searchInput.focus();
    renderEndpoints();
  });

  mockOnlyCheck.addEventListener('change', function() {
    mockOnly = mockOnlyCheck.checked;
    renderEndpoints();
  });

  function updateMockServerUI() {
    if (mockServerBtn) {
      if (mockServerRunning) {
        mockServerBtn.textContent = '■ Stop Mock Server';
        mockServerBtn.classList.add('running');
      } else {
        mockServerBtn.textContent = '▶ Start Mock Server';
        mockServerBtn.classList.remove('running');
      }
    }
    if (mockServerStatusEl) {
      mockServerStatusEl.textContent = mockServerRunning
        ? 'Port ' + msPort
        : '';
    }
  }

  if (mockServerBtn) {
    mockServerBtn.addEventListener('click', async function () {
      var action = mockServerRunning ? 'stop' : 'start';
      try {
        var resp = await fetch('/api/mock-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: action,
            port: msPort,
          }),
        });
        var data = await resp.json();
        if (resp.ok) {
          mockServerRunning = data.running;
          if (data.port) msPort = data.port;
          updateMockServerUI();
          if (data.running) {
            toast('Mock server running on port ' + msPort, 'success');
          } else {
            toast('Mock server stopped');
          }
        } else {
          toast(data.error || 'Failed to toggle mock server', 'error');
        }
      } catch (err) {
        toast('Error: ' + err.message, 'error');
      }
    });
  }

  function checkMockServerStatus() {
    fetch('/api/mock-server')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        mockServerRunning = data.running;
        if (data.port) msPort = data.port;
        updateMockServerUI();
      })
      .catch(function () {});
  }
  checkMockServerStatus();

  loadBtn.addEventListener('click', loadSpec);
  specSourceInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') loadSpec();
  });

  generateBtn.addEventListener('click', async function() {
    if (!currentData) return;

    var specSource = currentData.specSource;
    var outputDir = outputDirInput.value.trim() || 'src/mocks/handlers';

    var configEndpoints = {};
    var enabledCount = 0;
    Object.keys(endpointConfigs).forEach(function(k) {
      var c = endpointConfigs[k];
      configEndpoints[k] = {
        enabled: c.enabled,
        tag: c.tag,
        operationId: c.operationId,
        method: c.method,
        path: c.path
      };
      if (c.statusCode !== defaultStatusCode(c.method)) configEndpoints[k].statusCode = c.statusCode;
      if (c.delay && c.delay > 0) configEndpoints[k].delay = c.delay;
      if (c.mockData) configEndpoints[k].mockData = c.mockData;
      if (c.enabled) enabledCount++;
    });

    if (enabledCount === 0) {
      toast('Enable at least one endpoint to mock', 'error');
      return;
    }

    var origText = generateBtn.textContent;
    generateBtn.textContent = 'Generating...';
    generateBtn.disabled = true;

    try {
      var resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specSource: specSource, outputDir: outputDir, endpoints: configEndpoints })
      });
      var data = await resp.json();
      if (!resp.ok) { toast(data.error || 'Generation failed', 'error'); return; }
      dirty = false;
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      toast('Generated ' + enabledCount + ' handler(s) in ' + data.outputDir, 'success');
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      generateBtn.textContent = origText;
      generateBtn.disabled = false;
    }
  });

  function loadFromPreloadedData(data) {
    currentData = data;
    endpointConfigs = {};
    data.tags.forEach(function(t) {
      t.endpoints.forEach(function(ep) {
        endpointConfigs[ep.key] = {
          enabled: ep.enabled || false,
          tag: ep.tag,
          operationId: ep.operationId,
          method: ep.method,
          path: ep.path,
          statusCode: defaultStatusCode(ep.method),
          delay: 0,
          mockData: ep.mockExample || ''
        };
      });
    });
    generateBtn.disabled = false;
    toast('Loaded ' + data.totalEndpoints + ' endpoints', 'success');
    celebrateLoad();
    renderEndpoints();
  }

  if (typeof __PRELOADED_SPEC__ !== 'undefined') {
    loadFromPreloadedData(__PRELOADED_SPEC__);
  } else if (specSourceInput.value.trim()) {
    loadSpec();
  }
})();
</script>
</body>
</html>`;
}
