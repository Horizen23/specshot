import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import Handlebars from "handlebars";
import type { Faker } from "@faker-js/faker";
import type { OpenApiSchema } from "../types/types";

export interface FakerPluginContext {
  path: string;
  schema: OpenApiSchema;
}

export interface FakerPlugin {
  name: string;
  match: (context: FakerPluginContext) => boolean;
  generate: (faker: Faker, context: FakerPluginContext) => unknown;
}

export interface MswTemplateOverrides {
  dir?: string;
  handlers?: string;
  index?: string;
  browser?: string;
}

export interface TemplateOverrides {
  dir?: string;
  models?: string;
  types?: string;
  service?: string;
  index?: string;
  "interceptors-index"?: string;
  msw?: MswTemplateOverrides;
}

export interface OutputPaths {
  models?: string;
  services?: string;
  types?: string;
  index?: string;
}

export interface FileNaming {
  models?: string;
  service?: string;
  types?: string;
  index?: string;
}

export interface SpecshotUserConfig {
  coreDir?: string;
  integration?: string;
  interceptors?: string[];
  alias?: string;
  templates?: string | TemplateOverrides;
  mswOutputDir?: string;
  fakerPlugins?: FakerPlugin[];
  apis?: Record<
    string,
    {
      openapiUrl: string;
      providerDir: string;
      interceptors?: string[];
      mswOutputDir?: string;
      outputPaths?: OutputPaths;
      fileNaming?: FileNaming;
    }
  >;
}

export const DEFAULT_CONFIG_FILE = "specshot.config.mjs";

export async function loadUserConfig(
  cwd: string = process.cwd(),
  configPathOverride?: string,
): Promise<SpecshotUserConfig> {
  let fileToLoad = "";

  if (configPathOverride) {
    fileToLoad = path.resolve(cwd, configPathOverride);
  } else {
    const exts = [".mjs", ".js", ".cjs", ".json"];
    for (const ext of exts) {
      const p = path.resolve(cwd, `specshot.config${ext}`);
      if (fs.existsSync(p)) {
        fileToLoad = p;
        break;
      }
    }
    // Fallback to legacy specshot.json if specshot.config is not found
    if (!fileToLoad && fs.existsSync(path.resolve(cwd, "specshot.json"))) {
      fileToLoad = path.resolve(cwd, "specshot.json");
    }
  }

  if (fileToLoad && fs.existsSync(fileToLoad)) {
    try {
      if (fileToLoad.endsWith(".json")) {
        const content = fs.readFileSync(fileToLoad, "utf8");
        return JSON.parse(content) as SpecshotUserConfig;
      }
      const fileUrl = pathToFileURL(fileToLoad).href;
      const mod = await import(fileUrl);
      return (mod.default || mod) as SpecshotUserConfig;
    } catch (err) {
      console.error(`\n[Specshot] Failed to load ${fileToLoad}:`, err);
    }
  }
  return {};
}

export function resolveCorePaths(
  userConfig: SpecshotUserConfig,
  outputDir: string,
  importAlias: string | undefined,
): { corePathStr: string; servicesCorePath: string } {
  const providerDir = path.dirname(outputDir);

  let corePathStr = importAlias ? `${importAlias}/core` : "../core";
  if (!importAlias && userConfig.coreDir) {
    const targetCoreDir = path.resolve(process.cwd(), userConfig.coreDir);
    corePathStr = path.relative(providerDir, targetCoreDir).replace(/\\/g, "/");
    if (!corePathStr.startsWith(".")) corePathStr = "./" + corePathStr;
  }

  const servicesCorePath = importAlias
    ? `${importAlias}/core`
    : "../" + corePathStr;
  return { corePathStr, servicesCorePath };
}

export function relModulePath(
  fromDir: string,
  toDir: string,
  toFileNoExt: string,
): string {
  let rel = path.relative(fromDir, toDir).replace(/\\/g, "/");
  if (!rel) rel = ".";
  if (!rel.startsWith(".")) rel = "./" + rel;
  return toFileNoExt ? `${rel}/${toFileNoExt}` : rel;
}

export function computeCorePath(
  fromDir: string,
  providerDir: string,
  importAlias: string | undefined,
  coreDir?: string,
): string {
  if (importAlias) return `${importAlias}/core`;
  const targetCore = coreDir
    ? path.resolve(process.cwd(), coreDir)
    : path.join(providerDir, "core");
  let rel = path.relative(fromDir, targetCore).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

export function renderFileName(
  template: string | undefined,
  defaultName: string,
  context: Record<string, unknown>,
): string {
  if (!template) return defaultName;
  try {
    const compiled = Handlebars.compile(template);
    const result = compiled(context);
    return result || defaultName;
  } catch {
    return defaultName;
  }
}
