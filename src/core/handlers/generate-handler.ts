import http from "http";
import path from "path";
import { HandlerContext } from "./types";
import { jsonResponse, parseBody } from "./utils";
import { generateApi } from "../generate";
import { saveMockConfig, type MockConfigFile } from "../../types/mock-config";

export async function handleGenerate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const body = await parseBody(req);
  const {
    specSource,
    outputDir,
    endpoints: configEndpoints,
  } = JSON.parse(body);

  if (!specSource || !outputDir) {
    jsonResponse(res, { error: "Missing specSource or outputDir" }, 400);
    return;
  }

  const resolvedOutputDir = path.resolve(ctx.cwd, outputDir);

  const mockConfig: MockConfigFile = {
    endpoints: configEndpoints || {},
    outputDir,
    specSource,
    lastGenerated: new Date().toISOString(),
  };

  const selectedSet = new Set(
    Object.entries(
      (configEndpoints || {}) as Record<string, { enabled?: boolean }>,
    )
      .filter(([, v]) => v.enabled)
      .map(([k]) => k),
  );

  await generateApi(specSource, resolvedOutputDir, undefined, undefined, {
    msw: true,
    mswOnly: true,
    mswEndpointFilter: selectedSet.size > 0 ? selectedSet : undefined,
    mswEndpointConfigs: configEndpoints || {},
  });

  saveMockConfig(mockConfig, ctx.cwd);

  jsonResponse(res, {
    ok: true,
    outputDir: resolvedOutputDir,
    handlersGenerated: selectedSet.size,
  });
}
