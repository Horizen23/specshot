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
  plugins?: SpecshotPlugin[];
}

export async function loadUserConfig(
  cwd: string = process.cwd(),
): Promise<SpecshotUserConfig> {
  const exts = [".mjs", ".js", ".cjs"];
  for (const ext of exts) {
    const configPath = path.resolve(cwd, `specshot.config${ext}`);
    if (fs.existsSync(configPath)) {
      try {
        const fileUrl = pathToFileURL(configPath).href;
        const mod = await import(fileUrl);
        return (mod.default || mod) as SpecshotUserConfig;
      } catch (err) {
        console.error(`\n[Specshot] Failed to load ${configPath}:`, err);
      }
    }
  }
  return {};
}
