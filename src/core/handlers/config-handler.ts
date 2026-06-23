import http from "http";
import { HandlerContext } from "./types";
import { jsonResponse, parseBody } from "./utils";
import { loadMockConfig, saveMockConfig, type MockConfigFile } from "../../types/mock-config";

export function handleGetConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const config = loadMockConfig(ctx.cwd);
  config.mockServerPort = ctx.state.mockServerPort;
  config.mockServerRunning = ctx.state.isRunning;
  if (ctx.options.file || ctx.options.url) {
    config.specSource = ctx.options.file || ctx.options.url || config.specSource;
  }
  if (ctx.options.output) {
    config.outputDir = ctx.options.output;
  }
  jsonResponse(res, config);
}

export async function handlePostConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const body = await parseBody(req);
  const incomingConfig: MockConfigFile = JSON.parse(body);
  const existingConfig = loadMockConfig(ctx.cwd);

  const newConfig: MockConfigFile = {
    ...existingConfig,
    ...incomingConfig,
    endpoints: incomingConfig.endpoints || existingConfig.endpoints || {},
    mockServerPort: ctx.state.mockServerPort,
  };

  saveMockConfig(newConfig, ctx.cwd);
  ctx.restartMockServer(ctx.cwd);
  jsonResponse(res, { ok: true });
}
