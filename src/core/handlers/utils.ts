import http from "http";
import path from "path";

export function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function resolveSpecSource(
  query: URLSearchParams,
  cwd: string,
): string | null {
  const source = query.get("source");
  if (!source) return null;

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }
  return path.resolve(cwd, source);
}
