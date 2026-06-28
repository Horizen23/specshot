import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
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

export interface SpecshotTemplateData extends Record<string, unknown> {
  outDir?: string;
  coreOut?: string;
}

/** Template file overrides.
 * `dir` is a global override directory; other keys map to per-template file paths
 * (key names come from the template registry's `configKey`). */
export interface TemplateOverrides {
  dir?: string;
  [key: string]: string | undefined;
}

export interface SpecshotUserConfig<
  TemplateData extends SpecshotTemplateData = SpecshotTemplateData,
  Overrides extends TemplateOverrides = TemplateOverrides,
> {
  alias?: string;
  preset?: string;
  /** Custom Handlebars templates directory or per-template file overrides */
  templates?: string | Overrides;
  fakerPlugins?: FakerPlugin[];
  /** Arbitrary data passed to all templates */
  templateData?: TemplateData;
  apis?: Record<
    string,
    {
      openapiUrl: string;
      templateData?: TemplateData;
    }
  >;
}

export const DEFAULT_CONFIG_FILE = "specshot.config.mjs";

export async function loadUserConfig<
  TemplateData extends Record<string, unknown> = Record<string, unknown>,
>(
  cwd: string = process.cwd(),
  configPathOverride?: string,
): Promise<SpecshotUserConfig<TemplateData>> {
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
      let config: SpecshotUserConfig<TemplateData>;
      if (fileToLoad.endsWith(".json")) {
        const content = fs.readFileSync(fileToLoad, "utf8");
        config = JSON.parse(content) as SpecshotUserConfig<TemplateData>;
      } else {
        const fileUrl = pathToFileURL(fileToLoad).href;
        const mod = await import(fileUrl);
        config = (mod.default || mod) as SpecshotUserConfig<TemplateData>;
      }
      return config;
    } catch (err) {
      console.error(`\n[Specshot] Failed to load ${fileToLoad}:`, err);
    }
  }
  return {};
}
