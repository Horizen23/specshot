/**
 * proxy-handler.ts
 *
 * Standalone HTTP proxy logic for the SpecShot mock web server.
 * Forwards unmatched requests to a configured upstream target.
 */
import http from "http";
import https from "https";

/**
 * Pipe an incoming request to an upstream proxy target.
 * Calls `res.writeHead(502)` on connection errors.
 */
export function proxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  proxyTarget: string,
): void {
  const targetUrl = new URL(proxyTarget);
  const isHttps = targetUrl.protocol === "https:";
  const proxyModule = isHttps ? https : http;
  const requestMethod = (req.method || "GET").toUpperCase();

  const proxyReq = proxyModule.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: req.url,
      method: requestMethod,
      headers: {
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([k]) => k !== "host"),
        ),
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy error" }));
  });

  req.pipe(proxyReq);
}
