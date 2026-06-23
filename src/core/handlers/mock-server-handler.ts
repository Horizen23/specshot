import http from "http";
import { HandlerContext } from "./types";
import { jsonResponse, parseBody } from "./utils";
import { loadMockConfig, saveMockConfig } from "../../types/mock-config";

export function handleGetMockServer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  jsonResponse(res, {
    running: ctx.state.isRunning,
    port: ctx.state.mockServerPort,
  });
}

export async function handlePostMockServer(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const body = await parseBody(req);
  const { action, port } = JSON.parse(body);

  if (action === "start") {
    if (ctx.state.isRunning) {
      jsonResponse(res, {
        ok: true,
        port: ctx.state.mockServerPort,
        running: true,
      });
      return;
    }
    const targetPort = port || ctx.state.mockServerPort;
    try {
      await ctx.startMockServer(ctx.cwd, targetPort);
      const cfg = loadMockConfig(ctx.cwd);
      cfg.mockServerPort = ctx.state.mockServerPort;
      saveMockConfig(cfg, ctx.cwd);
      jsonResponse(res, {
        ok: true,
        port: ctx.state.mockServerPort,
        running: true,
      });
    } catch (err) {
      jsonResponse(res, { error: (err as Error).message }, 500);
    }
    return;
  }

  if (action === "stop") {
    ctx.stopMockServer();
    jsonResponse(res, { ok: true, running: false });
    return;
  }

  jsonResponse(res, { error: "Invalid action. Use 'start' or 'stop'" }, 400);
}
