import http from "http";
import { HandlerContext } from "./types";
import { jsonResponse, parseBody, resolveSpecSource } from "./utils";
import { loadSpec } from "../spec-loader";
import { loadMockConfig } from "../../types/mock-config";
import { flattenEndpoints, groupByTag } from "../../utils/openapi-utils";
import { mockJsonFromSchema, getSchemaTypes } from "../../utils/msw-utils";
import { loadUserConfig } from "../config-loader";

export async function handleGetSpec(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  ctx: HandlerContext,
) {
  const specSource = resolveSpecSource(url.searchParams, ctx.cwd);
  if (!specSource) {
    jsonResponse(res, { error: "Missing 'source' query parameter" }, 400);
    return;
  }

  const spec = await loadSpec(specSource);
  const endpoints = flattenEndpoints(spec);
  const groupedByTag = groupByTag(endpoints);
  const userConfig = await loadUserConfig(ctx.cwd);
  const tags = Array.from(groupedByTag.entries()).map(([tag, eps]) => ({
    tag,
    count: eps.length,
    endpoints: eps,
  }));

  const existingConfig = loadMockConfig(ctx.cwd);
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
      mockExample: mockJsonFromSchema(
        ep.responseSchema,
        spec.components?.schemas || {},
        new Set(),
        "auto",
        1,
      ),
      mockExampleFaker: mockJsonFromSchema(
        ep.responseSchema,
        spec.components?.schemas || {},
        new Set(),
        "faker",
        existingConfig.endpoints?.[ep.key]?.fakerArraySize || 3,
        existingConfig.endpoints?.[ep.key]?.fakerArraySizes || {},
        "root",
        existingConfig.endpoints?.[ep.key]?.fakerFormats || {},
        userConfig.fakerPlugins || [],
      ),
      schemaTypes: getSchemaTypes(
        ep.responseSchema,
        spec.components?.schemas || {},
      ),
    })),
  }));

  jsonResponse(res, {
    specSource,
    tags: tagsWithPreSelected,
    totalEndpoints: endpoints.length,
    availablePlugins: (userConfig.fakerPlugins || []).map((p) => p.name),
  });
}

export async function handleRegenerateFaker(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HandlerContext,
) {
  const body = await parseBody(req);
  try {
    const payload = JSON.parse(body);
    const specSource = payload.specSource;
    const key = payload.key;
    const fakerArraySizes = payload.fakerArraySizes || {};
    const fakerFormats = payload.fakerFormats || {};
    const userConfig = await loadUserConfig(ctx.cwd);

    const spec = await loadSpec(specSource);
    const endpoints = flattenEndpoints(spec);
    const ep = endpoints.find((e) => e.key === key);

    if (!ep) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
      return;
    }

    const mockExampleFaker = mockJsonFromSchema(
      ep.responseSchema,
      spec.components?.schemas || {},
      new Set(),
      "faker",
      fakerArraySizes["root"] || 3,
      fakerArraySizes,
      "root",
      fakerFormats,
      userConfig.fakerPlugins || [],
    );

    jsonResponse(res, { mockExampleFaker });
  } catch (err: any) {
    jsonResponse(res, { error: err.message }, 500);
  }
}
