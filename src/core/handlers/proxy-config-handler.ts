import http from "http";
import { HandlerContext } from "./types";
import { jsonResponse, parseBody } from "./utils";
import { loadMockConfig, saveMockConfig } from "../../types/mock-config";

export async function handleProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const body = await parseBody(req);
  const { proxyTarget, proxyEnabled } = JSON.parse(body);
  const cfg = loadMockConfig(ctx.cwd);
  if (proxyTarget !== undefined) cfg.proxyTarget = proxyTarget;
  if (proxyEnabled !== undefined) cfg.proxyEnabled = proxyEnabled;
  saveMockConfig(cfg, ctx.cwd);
  jsonResponse(res, { ok: true });
}
