import fs from "fs";
import path from "path";
import { getTemplatesBaseDir, getPresetDir } from "./paths";
import { parseFrontmatter } from "./frontmatter";

export interface PresetInfo {
  name: string;
  description: string;
  features: string[];
  deps: string[];
  source: "built-in" | "community" | "custom";
}

export const DEFAULT_PRESET = "class";

function getBuiltInPresetNames(): Set<string> {
  const base = getTemplatesBaseDir();
  const names = new Set<string>();
  for (const entry of fs.readdirSync(base)) {
    const dir = path.join(base, entry);
    if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "_preset.json"))) {
      names.add(entry);
    }
  }
  return names;
}

export function getAvailablePresets(): PresetInfo[] {
  const seen = new Map<string, PresetInfo>();

  // 1. Scan built-in + installed community presets (specshot package dir)
  const pkgBase = getTemplatesBaseDir();
  for (const entry of fs.readdirSync(pkgBase)) {
    const dir = path.join(pkgBase, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    const info = loadPresetManifest(entry, dir);
    if (info) seen.set(entry, info);
  }

  // 2. Scan project-level custom presets (user's project templates/presets/)
  //    Project-level OVERRIDES package-level (ejected presets take priority)
  const projectBase = path.resolve(process.cwd(), ".specshot/templates/presets");
  if (fs.existsSync(projectBase) && projectBase !== pkgBase) {
    for (const entry of fs.readdirSync(projectBase)) {
      const dir = path.join(projectBase, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const info = loadPresetManifest(entry, dir, "custom");
      if (info) seen.set(entry, info); // overwrites package-level entry
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

interface RawPresetManifest {
  name?: unknown;
  description?: unknown;
  features?: unknown;
  deps?: unknown;
}

function loadPresetManifest(name: string, dir: string, sourceOverride?: "built-in" | "community" | "custom"): PresetInfo | null {
  const builtInNames = getBuiltInPresetNames();
  const manifestPath = path.join(dir, "_preset.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const data = JSON.parse(raw) as RawPresetManifest;
      const warnings: string[] = [];
      if (typeof data.name !== "string" || !data.name) {
        warnings.push(`"name" must be a non-empty string, using directory name "${name}"`);
      }
      if (typeof data.description !== "string" || !data.description) {
        warnings.push(`"description" must be a non-empty string, using directory name "${name}"`);
      }
      if (data.features !== undefined && !Array.isArray(data.features)) {
        warnings.push(`"features" must be an array, ignoring`);
      }
      if (data.deps !== undefined && !Array.isArray(data.deps)) {
        warnings.push(`"deps" must be an array, ignoring`);
      }
      if (warnings.length > 0) {
        console.warn(`  [SpecShot] Preset "${name}" warnings at ${manifestPath}:`);
        for (const w of warnings) {
          console.warn(`    - ${w}`);
        }
      }
      const source = sourceOverride
        || (builtInNames.has(name) ? "built-in" : "community");
      return {
        name: (typeof data.name === "string" && data.name) ? data.name : name,
        description: (typeof data.description === "string" && data.description) ? data.description : name,
        features: Array.isArray(data.features) ? data.features.filter((f): f is string => typeof f === "string") : [],
        deps: Array.isArray(data.deps) ? data.deps.filter((d): d is string => typeof d === "string") : [],
        source,
      };
    } catch (err) {
      console.warn(`  [SpecShot] Failed to parse ${manifestPath}: ${err}`);
    }
  }
  // If no manifest, still consider it a valid preset if it has templates/
  const hasTemplates = fs.existsSync(path.join(dir, "templates"));
  if (hasTemplates) {
    const source = sourceOverride
      || (builtInNames.has(name) ? "built-in" : "community");
    return { name, description: name, features: [], deps: [], source };
  }
  return null;
}

export function validatePresetStructure(preset: string): string[] {
  const errors: string[] = [];
  const presetDir = getPresetDir(preset);

  if (!fs.existsSync(presetDir)) {
    errors.push(`Preset directory "${preset}" does not exist at ${presetDir}`);
    return errors;
  }

  const hasTemplates = fs.existsSync(path.join(presetDir, "templates"));
  if (!hasTemplates) {
    errors.push(`Preset "${preset}" must have a templates/ directory`);
  }

  const manifestPath = path.join(presetDir, "_preset.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const data = JSON.parse(raw);
      if (!data.name || typeof data.name !== "string") {
        errors.push(`_preset.json: "name" must be a non-empty string`);
      }
      if (!data.description || typeof data.description !== "string") {
        errors.push(`_preset.json: "description" must be a non-empty string`);
      }
    } catch {
      errors.push(`_preset.json: failed to parse JSON`);
    }
  } else {
    errors.push(`_preset.json: not found (recommended for community presets)`);
  }

  if (hasTemplates) {
    const templatesDir = path.join(presetDir, "templates");
    const outputTypes = fs.readdirSync(templatesDir).filter((e) => {
      const stat = fs.statSync(path.join(templatesDir, e));
      return stat.isDirectory();
    });
    if (outputTypes.length === 0) {
      errors.push(`templates/: has no output type directories (e.g. api/, mocks/)`);
    }
    for (const outputType of outputTypes) {
      const outputTypeDir = path.join(templatesDir, outputType);
      const entries = fs.readdirSync(outputTypeDir).filter((e) => {
        const stat = fs.statSync(path.join(outputTypeDir, e));
        return stat.isDirectory();
      });
      if (entries.length === 0) {
        errors.push(`templates/${outputType}/: has no template directories`);
      }
      for (const entry of entries) {
        const tplDir = path.join(outputTypeDir, entry);
        const files = fs.readdirSync(tplDir);

        const hasAnyHbs = files.some((f) => f.endsWith(".hbs"));
        if (!hasAnyHbs) continue;

        const mainFile = files.find((f) => f.endsWith(".hbs") && !f.startsWith("_"));
        if (!mainFile) {
          errors.push(`templates/${outputType}/${entry}/: has no .hbs template files`);
        } else {
          const hasBehavior = files.includes("_behavior.hbs");
          if (hasBehavior) {
            const behaviorContent = fs.readFileSync(path.join(tplDir, "_behavior.hbs"), "utf8").trim();
            if (behaviorContent !== "scaffold" && behaviorContent !== "generated") {
              errors.push(`templates/${outputType}/${entry}/_behavior.hbs: must contain 'scaffold' or 'generated' (got '${behaviorContent}')`);
            }
          } else {
            const content = fs.readFileSync(path.join(tplDir, mainFile), "utf8");
            const meta = parseFrontmatter(content);
            if (!meta?.behavior) {
              errors.push(`templates/${outputType}/${entry}/${mainFile}: missing frontmatter 'behavior' (must be 'scaffold' or 'generated')`);
            } else if (meta.behavior !== "scaffold" && meta.behavior !== "generated") {
              errors.push(`templates/${outputType}/${entry}/${mainFile}: frontmatter 'behavior' must be 'scaffold' or 'generated' (got '${meta.behavior}')`);
            }
          }
        }
      }
    }
  }

  return errors;
}

export function getPresetInfo(name: string): PresetInfo | undefined {
  return getAvailablePresets().find((p) => p.name === name);
}

export function isValidPreset(name: string): boolean {
  return getAvailablePresets().some((p) => p.name === name);
}
