import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderTemplates } from "./renderer";
import type { TemplateOverrides } from "./config-loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplatesBaseDir(): string {
  const devPath = path.join(__dirname, "../../templates/presets");
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(__dirname, "../templates/presets");
  if (fs.existsSync(prodPath)) return prodPath;
  throw new Error("Could not locate templates/presets directory.");
}

function getOneTimeDir(preset: string): string {
  const base = getTemplatesBaseDir();
  const dir = path.join(base, preset, "one-time");
  if (fs.existsSync(dir)) return dir;
  throw new Error(`Could not locate one-time templates for preset '${preset}'.`);
}

export interface InstallOptions {
  preset: string;
  openapiUrl?: string;
  data?: Record<string, unknown>;
}

export function installScaffold(options: InstallOptions): boolean {
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

  let oneTimeExists = false;
  try {
    const base = getTemplatesBaseDir();
    oneTimeExists = fs.existsSync(path.join(base, preset, "one-time"));
  } catch {}
  if (!oneTimeExists) return false;

  const outDir = (apiConfig.templateData?.outDir as string)
    || (templateData?.outDir as string)
    || `src/lib/api/${apiName}`;
  const coreOut = (apiConfig.templateData?.coreOut as string)
    || (templateData?.coreOut as string)
    || `${outDir}/../core`;

  const mergedData: Record<string, unknown> = {
    outDir,
    coreOut,
    ...templateData,
    ...apiConfig.templateData,
  };

  return installScaffold({
    preset,
    openapiUrl: apiConfig.openapiUrl,
    data: {
      hook: "none",
      pluginNames: [],
      ...mergedData,
    },
  });
}
