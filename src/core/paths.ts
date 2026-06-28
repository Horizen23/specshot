import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let templatesBaseDir: string | null = null;

export function getTemplatesBaseDir(): string {
  if (templatesBaseDir) return templatesBaseDir;
  const candidates = [
    path.join(__dirname, "../../templates/presets"),
    path.join(__dirname, "../templates/presets"),
    path.join(__dirname, "../../../templates/presets"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      templatesBaseDir = candidate;
      return candidate;
    }
  }
  throw new Error("Could not locate templates/presets directory.");
}

export function getProjectPresetsDir(): string | null {
  const dir = path.resolve(process.cwd(), "templates/presets");
  return fs.existsSync(dir) ? dir : null;
}

export function getPresetDir(preset: string): string {
  const projectDir = getProjectPresetsDir();
  if (projectDir) {
    const projectPreset = path.join(projectDir, preset);
    if (fs.existsSync(projectPreset)) return projectPreset;
  }
  return path.join(getTemplatesBaseDir(), preset);
}

/** Returns the root templates/ directory inside a preset */
export function getPresetTemplatesDir(preset: string): string {
  return path.join(getPresetDir(preset), "templates");
}

/** Returns an output type directory (e.g. "api" or "mocks") */
export function getOutputTypeDir(preset: string, outputType: string): string {
  return path.join(getPresetTemplatesDir(preset), outputType);
}

import { parseFrontmatter } from "./frontmatter";

/** Returns a specific template directory (e.g. "api/service-per-tag") */
export function getTemplateDir(preset: string, outputType: string, templateName: string): string {
  return path.join(getOutputTypeDir(preset, outputType), templateName);
}

/** Returns the behavior content from the frontmatter of the main .hbs template file or _behavior.hbs fallback */
export function getTemplateBehavior(templateDir: string): "scaffold" | "generated" | null {
  if (!fs.existsSync(templateDir)) return null;

  const behaviorPath = path.join(templateDir, "_behavior.hbs");
  if (fs.existsSync(behaviorPath)) {
    const content = fs.readFileSync(behaviorPath, "utf8").trim();
    if (content === "scaffold" || content === "generated") return content;
  }

  function findFirstHbsFile(dir: string): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFirstHbsFile(fullPath);
        if (found) return found;
      } else if (entry.name.endsWith(".hbs") && !entry.name.startsWith("_")) {
        return fullPath;
      }
    }
    return null;
  }

  const mainFilePath = findFirstHbsFile(templateDir);
  if (!mainFilePath) return null;
  
  const content = fs.readFileSync(mainFilePath, "utf8");
  const meta = parseFrontmatter(content);
  if (meta?.behavior === "scaffold" || meta?.behavior === "generated") return meta.behavior;
  return null;
}

/** Lists all output type directories in a preset */
export function getOutputTypes(preset: string): string[] {
  const templatesDir = getPresetTemplatesDir(preset);
  if (!fs.existsSync(templatesDir)) return [];
  return fs.readdirSync(templatesDir).filter((entry) => {
    const fullPath = path.join(templatesDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });
}

/** Lists all template directories under an output type */
export function getTemplateNames(preset: string, outputType: string): string[] {
  const outputDir = getOutputTypeDir(preset, outputType);
  if (!fs.existsSync(outputDir)) return [];
  return fs.readdirSync(outputDir).filter((entry) => {
    const fullPath = path.join(outputDir, entry);
    return fs.statSync(fullPath).isDirectory();
  });
}

/** Check if preset has any templates at all */
export function hasPresetTemplates(preset: string): boolean {
  const templatesDir = getPresetTemplatesDir(preset);
  return fs.existsSync(templatesDir) && fs.readdirSync(templatesDir).length > 0;
}

export function assertPresetExists(preset: string): void {
  const presetDir = getPresetDir(preset);
  if (!fs.existsSync(presetDir)) {
    throw new Error(
      `Preset "${preset}" not found at ${presetDir}\n` +
      `Available presets can be listed with: npx specshot templates list`
    );
  }
}

export function assertPresetHasTemplates(preset: string): void {
  assertPresetExists(preset);
  if (!hasPresetTemplates(preset)) {
    throw new Error(
      `Preset "${preset}" has no templates/ directory\n` +
      `Each preset must have a templates/ directory with output type subdirectories (api/, mocks/).`
    );
  }
}
