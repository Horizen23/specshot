import fs from "fs";
import path from "path";
import { renderTemplates } from "./renderer";
import type { TemplateOverrides } from "./config-loader";
import { getPresetTemplatesDir, getTemplateBehavior, getOutputTypes, getTemplateNames } from "./paths";
import { readSchemaDefaults } from "./template-registry";

export interface InstallOptions {
  preset: string;
  openapiUrl?: string;
  data?: Record<string, unknown>;
}

function getScaffoldDirs(preset: string): string[] {
  const dirs: string[] = [];
  const templatesDir = getPresetTemplatesDir(preset);
  if (!fs.existsSync(templatesDir)) return dirs;

  for (const outputType of getOutputTypes(preset)) {
    for (const templateName of getTemplateNames(preset, outputType)) {
      const templateDir = path.join(templatesDir, outputType, templateName);
      if (getTemplateBehavior(templateDir) === "scaffold") {
        dirs.push(templateDir);
      }
    }
  }
  return dirs;
}

export function installScaffold(options: InstallOptions): boolean {
  const scaffoldDirs = getScaffoldDirs(options.preset);
  if (scaffoldDirs.length === 0) return false;

  let serverUrl = "";
  if (options.openapiUrl) {
    try {
      const parsedUrl = new URL(options.openapiUrl);
      serverUrl = parsedUrl.origin;
    } catch {
      console.warn(`  [SpecShot] Invalid openapiUrl: ${options.openapiUrl}`);
    }
  }

  const data: Record<string, unknown> = {
    ...options.data,
    serverUrl,
  };

  let totalGenerated = 0;
  for (const scaffoldDir of scaffoldDirs) {
    const generated = renderTemplates({
      templateDir: scaffoldDir,
      data,
      skipIfExists: true,
      behavior: "scaffold",
    });
    totalGenerated += generated.length;
  }

  if (totalGenerated > 0) {
    console.log(`  scaffold: ${totalGenerated} files installed`);
  }
  return totalGenerated > 0;
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

  const scaffoldDirs = getScaffoldDirs(preset);
  if (scaffoldDirs.length === 0) return false;

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
