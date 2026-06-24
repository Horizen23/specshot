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

  const { loadUserConfig } = await import("../config-loader");
  const userConfig = await loadUserConfig(ctx.cwd);

  // Try to find the specific API config based on the outputDir or specSource
  let finalMswOutputDir = userConfig.mswOutputDir;
  if (userConfig.apis) {
    for (const apiConfig of Object.values(userConfig.apis)) {
      const apiProviderDir = path.resolve(ctx.cwd, apiConfig.providerDir);
      // If the outputDir (e.g. .../api/meme/services) starts with the api providerDir (e.g. .../api/meme)
      if (resolvedOutputDir.startsWith(apiProviderDir)) {
        if (apiConfig.mswOutputDir) {
          finalMswOutputDir = apiConfig.mswOutputDir;
        }
        break;
      }
    }
  }

  await generateApi(specSource, resolvedOutputDir, undefined, undefined, {
    msw: true,
    mswOnly: true,
    mswEndpointFilter: selectedSet, // Pass the set directly, even if empty, so disabled mocks are NOT generated
    mswEndpointConfigs: configEndpoints || {},
    mswOutputDir: finalMswOutputDir ? path.resolve(ctx.cwd, finalMswOutputDir) : undefined,
  });

  saveMockConfig(mockConfig, ctx.cwd);

  jsonResponse(res, {
    ok: true,
    outputDir: resolvedOutputDir,
    handlersGenerated: selectedSet.size,
  });
}
