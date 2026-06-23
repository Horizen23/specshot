import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import type { Faker } from "@faker-js/faker";
import type { OpenApiSchema } from "../types/types";

export interface FakerPluginContext {
  path: string;
  schema: OpenApiSchema;
}

export interface SpecshotPlugin {
  name: string;
  match: (context: FakerPluginContext) => boolean;
  generate: (faker: Faker, context: FakerPluginContext) => unknown;
}

export interface SpecshotUserConfig {
  coreDir?: string;
  providerDir?: string;
  integration?: string;
  interceptors?: string[];
  openapiUrl?: string;
  alias?: string;
  templates?: string;
  plugins?: SpecshotPlugin[];
  apis?: Record<string, {
    openapiUrl?: string;
    providerDir?: string;
    interceptors?: string[];
  }>;
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
