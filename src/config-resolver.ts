import fs from "fs";
import path from "path";
import { CONFIG_FILE } from "./constants";

export function resolveConfig(
  outputDir: string,
  importAlias: string | undefined,
  configPathOverride: string | undefined,
): { corePathStr: string; servicesCorePath: string } {
  const configPath = configPathOverride
    ? path.resolve(process.cwd(), configPathOverride)
    : path.resolve(process.cwd(), CONFIG_FILE);
  let config: Record<string, string> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (_e) {
      /* ignore invalid JSON */
    }
  }

  const providerDir = path.dirname(outputDir);

  let corePathStr = importAlias ? `${importAlias}/core` : "../core";
  if (!importAlias && config.coreDir) {
    const targetCoreDir = path.resolve(process.cwd(), config.coreDir);
    corePathStr = path.relative(providerDir, targetCoreDir).replace(/\\/g, "/");
    if (!corePathStr.startsWith(".")) corePathStr = "./" + corePathStr;
  }

  const servicesCorePath = importAlias
    ? `${importAlias}/core`
    : "../" + corePathStr;
  return { corePathStr, servicesCorePath };
}
