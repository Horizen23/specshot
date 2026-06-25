import http from "http";
import type { HandlerContext } from "./types";
import { jsonResponse, parseBody } from "./utils";
import {
  loadMockConfig,
  saveMockConfig,
  type WebSocketEndpointEntry,
} from "../../types/mock-config";
import { broadcast, getConnectionCounts } from "../ws-connections";

export async function handleGetWebSocket(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _url: URL,
  ctx: HandlerContext,
): Promise<void> {
  const config = loadMockConfig(ctx.cwd);
  const wsEndpoints = config.webSocketEndpoints || {};
  const counts = getConnectionCounts();

  const entries = Object.entries(wsEndpoints).map(([key, ep]) => ({
    id: key,
    ...ep,
    connections: counts[ep.path] ?? 0,
  }));

  jsonResponse(res, { endpoints: entries });
}

export async function handlePostWebSocket(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
): Promise<void> {
  const body = await parseBody(req);
  let data: { path: string; description?: string; enabled?: boolean };
  try {
    data = JSON.parse(body);
  } catch {
    jsonResponse(res, { error: "Invalid JSON" }, 400);
    return;
  }

  if (!data.path || typeof data.path !== "string") {
    jsonResponse(res, { error: "path is required" }, 400);
    return;
  }

  const cleanPath = data.path.startsWith("/") ? data.path : `/${data.path}`;
  const id = cleanPath.replace(/[^a-zA-Z0-9/-]/g, "-").replace(/\/+/g, "/");

  const config = loadMockConfig(ctx.cwd);
  const wsEndpoints = config.webSocketEndpoints || {};

  wsEndpoints[id] = {
    path: cleanPath,
    description: data.description || "",
    enabled: data.enabled !== false,
  };

  config.webSocketEndpoints = wsEndpoints;
  saveMockConfig(config, ctx.cwd);

  const counts = getConnectionCounts();
  jsonResponse(res, {
    endpoint: { id, ...wsEndpoints[id], connections: counts[cleanPath] ?? 0 },
  });
}

export async function handleDeleteWebSocket(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _url: URL,
  ctx: HandlerContext,
): Promise<void> {
  const url = new URL(req.url || "/", "http://localhost");
  const id = url.searchParams.get("id");
  if (!id) {
    jsonResponse(res, { error: "id is required" }, 400);
    return;
  }

  const config = loadMockConfig(ctx.cwd);
  const wsEndpoints = config.webSocketEndpoints || {};

  if (!wsEndpoints[id]) {
    jsonResponse(res, { error: "Endpoint not found" }, 404);
    return;
  }

  delete wsEndpoints[id];
  config.webSocketEndpoints = wsEndpoints;
  saveMockConfig(config, ctx.cwd);

  jsonResponse(res, { deleted: id });
}

export async function handleTriggerWebSocket(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
): Promise<void> {
  const body = await parseBody(req);
  let data: { path: string; message: string };
  try {
    data = JSON.parse(body);
  } catch {
    jsonResponse(res, { error: "Invalid JSON" }, 400);
    return;
  }

  if (!data.path || typeof data.path !== "string") {
    jsonResponse(res, { error: "path is required" }, 400);
    return;
  }

  const message =
    typeof data.message === "string" ? data.message : JSON.stringify(data);

  const result = broadcast(data.path, message);

  if (result.error && result.sent === 0) {
    jsonResponse(res, result, 404);
    return;
  }

  jsonResponse(res, { sent: result.sent, path: data.path });
}
