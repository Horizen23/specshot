import fs from "fs";
import path from "path";
import { renderTemplates } from "./renderer";
import type { TemplateOverrides } from "./config-loader";
import { getTemplatesBaseDir, getOneTimeDir, hasOneTimeDir } from "./paths";
import { readSchemaDefaults } from "./template-registry";

export interface InstallOptions {
  preset: string;
  openapiUrl?: string;
  data?: Record<string, unknown>;
}

export function installScaffold(options: InstallOptions): boolean {
  if (!hasOneTimeDir(options.preset)) return false;
  const oneTimeDir = getOneTimeDir(options.preset);

  let serverUrl = "";
  if (options.openapiUrl) {
    try {
      const parsedUrl = new URL(options.openapiUrl);
      serverUrl = parsedUrl.origin;
    } catch {}
  }

  const data: Record<string, unknown> = {
    ...options.data,
    serverUrl,
  };

  const generated = renderTemplates({
    templateDir: oneTimeDir,
    data,
    skipIfExists: true,
  });
  if (generated.length > 0) {
    console.log(`  one-time: ${generated.length} files installed`);
  }
  return generated.length > 0;
}

export function hasCustomTemplateConfig(
  templates?: string | TemplateOverrides,
): boolean {
  if (!templates) return false;
  if (typeof templates === "string") return templates.length > 0;
  return Object.keys(templates).length > 0;
}

export function scaffoldInfrastructure(params: {
  preset: string;
  apiConfig: {
    openapiUrl?: string;
    templateData?: Record<string, unknown>;
  };
  apiName: string;
  templateData?: Record<string, unknown>;
}): boolean {
  const { preset, apiConfig, apiName, templateData } = params;

  if (!hasOneTimeDir(preset)) return false;

  const outDir = (apiConfig.templateData?.outDir as string)
    || (templateData?.outDir as string)
    || `src/lib/api/${apiName}`;
  const coreOut = (apiConfig.templateData?.coreOut as string)
    || (templateData?.coreOut as string)
    || `${outDir}/../core`;

  const schemaDefaults = readSchemaDefaults(preset);
  const mergedData: Record<string, unknown> = {
    ...schemaDefaults,
    outDir,
    coreOut,
    ...templateData,
    ...apiConfig.templateData,
  };

  return installScaffold({
    preset,
    openapiUrl: apiConfig.openapiUrl,
    data: mergedData,
  });
}
