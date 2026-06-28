import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TemplateVariable {
  name: string;
  type: string;
  description: string;
}

export interface TemplateInfo {
  name: string;
  group: "generator" | "msw";
  file: string;
  description: string;
  variables: TemplateVariable[];
  configKey?: string;
}

export interface TemplateDataSchema {
  title: string;
  description: string;
  properties: Record<string, TemplateDataProp>;
}

interface TemplateDataProp {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
  default?: unknown;
}

const CONFIG_KEY_MAP: Record<string, string> = {
  "types-per-tag": "types",
  "service-per-tag": "service",
  "plugins": "plugins-index",
  "handler-per-tag": "msw-handlers",
  "msw-index": "msw-index",
  "msw-browser": "msw-browser",
};

function loadPresetTemplates(preset: string): TemplateInfo[] {
  const templates: TemplateInfo[] = [];
  const baseDir = findPresetDir(preset);
  if (!baseDir) return [];

  const repeatableDir = path.join(baseDir, "repeatable");
  if (!fs.existsSync(repeatableDir)) return templates;

  for (const group of fs.readdirSync(repeatableDir)) {
    const groupDir = path.join(repeatableDir, group);
    if (!fs.statSync(groupDir).isDirectory()) continue;

    for (const entry of fs.readdirSync(groupDir)) {
      const tplDir = path.join(groupDir, entry);
      if (!fs.statSync(tplDir).isDirectory()) continue;

      const files = fs.readdirSync(tplDir);
      const mainFile = files.find((f) => f.endsWith(".hbs") && !f.startsWith("_"));
      if (!mainFile) continue;

      templates.push({
        name: entry,
        group: group as "generator" | "msw",
        file: path.join(entry, mainFile),
        description: entry,
        variables: [],
        configKey: CONFIG_KEY_MAP[entry],
      });
    }
  }

  return templates;
}

function findPresetDir(preset: string): string | undefined {
  const candidates = [
    path.join(__dirname, `../../templates/presets/${preset}`),
    path.join(__dirname, `../templates/presets/${preset}`),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return undefined;
}

let cachedTemplates: TemplateInfo[] | null = null;

function getDefaultRegistry(): TemplateInfo[] {
  if (cachedTemplates) return cachedTemplates;
  cachedTemplates = loadPresetTemplates("class");
  return cachedTemplates;
}

export function getTemplateInfo(name: string, preset = "class"): TemplateInfo | undefined {
  const registry = preset === "class" ? getDefaultRegistry() : loadPresetTemplates(preset);
  return registry.find((t) => t.name === name || t.file === name || t.configKey === name);
}

export function getAllTemplateNames(preset = "class"): string[] {
  const registry = preset === "class" ? getDefaultRegistry() : loadPresetTemplates(preset);
  return registry.map((t) => t.name);
}

export function getRegistry(preset = "class"): TemplateInfo[] {
  return preset === "class" ? getDefaultRegistry() : loadPresetTemplates(preset);
}

/** Build an inline TS type string for TemplateOverrides from registry configKeys.
 *  Returns e.g. `{ dir?: string; types?: string; service?: string; msw-handlers?: string }` */
export function generateTemplateOverridesType(preset = "class"): string {
  const registry = getRegistry(preset);
  const configKeys = new Set<string>();
  for (const tpl of registry) {
    if (tpl.configKey) configKeys.add(tpl.configKey);
  }
  if (configKeys.size === 0) return "";
  const keys = Array.from(configKeys).sort();
  let out = "{ ";
  out += "dir?: string; ";
  for (let i = 0; i < keys.length; i++) {
    out += `${keys[i]}?: string`;
    if (i < keys.length - 1) out += "; ";
  }
  out += " }";
  return out;
}

// ── Template Data Schema ──

export function readTemplateDataSchema(dir: string): TemplateDataSchema | null {
  const schemaPath = path.join(dir, "_template-data.schema.json");
  if (!fs.existsSync(schemaPath)) return null;
  try {
    const raw = fs.readFileSync(schemaPath, "utf8");
    return JSON.parse(raw) as TemplateDataSchema;
  } catch {
    return null;
  }
}

export function readAllSchemas(preset = "class"): TemplateDataSchema[] {
  const schemas: TemplateDataSchema[] = [];
  const baseDir = findPresetDir(preset);
  if (!baseDir) return schemas;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name === "_template-data.schema.json") {
        const schema = readTemplateDataSchema(dir);
        if (schema) schemas.push(schema);
      }
    }
  }

  scanDir(path.join(baseDir, "repeatable"));
  scanDir(path.join(baseDir, "one-time"));

  return schemas;
}

export function mergeSchemasToType(schemas: TemplateDataSchema[]): string {
  const merged: Record<string, { tsType: string; description: string }> = {};

  for (const schema of schemas) {
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      let tsType: string;
      if (prop.enum) {
        tsType = prop.enum.map((v) => JSON.stringify(v)).join(" | ");
      } else if (prop.type === "array" && prop.items) {
        if (prop.items.enum) {
          tsType = `(${prop.items.enum.map((v: string) => JSON.stringify(v)).join(" | ")})[]`;
        } else {
          tsType = `${propItemsType(prop.items.type)}[]`;
        }
      } else {
        tsType = jsonSchemaToTs(prop.type);
      }
      merged[key] = { tsType, description: prop.description || "" };
    }
  }

  if (Object.keys(merged).length === 0) return "";

  const entries = Object.entries(merged);
  let output = "{ ";
  for (let i = 0; i < entries.length; i++) {
    const [key, { tsType }] = entries[i];
    output += `${key}?: ${tsType}`;
    if (i < entries.length - 1) output += "; ";
  }
  output += " }";
  return output;
}

function propItemsType(type?: string): string {
  switch (type) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    default: return "unknown";
  }
}

function jsonSchemaToTs(type: string): string {
  switch (type) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "array": return "unknown[]";
    case "object": return "Record<string, unknown>";
    default: return "unknown";
  }
}

export function generateTypeFile(preset = "class"): string {
  const schemas = readAllSchemas(preset);
  const hasData = schemas.some(s => Object.keys(s.properties || {}).length > 0);
  const hasOverrides = getRegistry(preset).some(t => t.configKey);

  if (!hasData && !hasOverrides) {
    return `import('specshot').SpecshotConfig`;
  }
  const tdParam = hasData ? "TemplateData" : "Record<string, unknown>";
  const ovParam = hasOverrides ? "Overrides" : "Record<string, string>";
  return `import('specshot').SpecshotConfig<${tdParam}, ${ovParam}>`;
}

/** Generate a multi-line JSDoc typedef block for TemplateData and Overrides.
 *  Returns a string like:
 *  /**
 *   * @typedef {Object} TemplateData
 *   * @property {string} [hook] - ...
 *   * @typedef {Object} Overrides
 *   * @property {string} [dir] - ...
 *   \/
 */
export function generateJSDocTypeDef(preset = "class"): string {
  const schemas = readAllSchemas(preset);
  const merged: Record<string, { tsType: string; description: string }> = {};
  for (const schema of schemas) {
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      let tsType: string;
      if (prop.enum) {
        tsType = prop.enum.map((v) => JSON.stringify(v)).join(" | ");
      } else if (prop.type === "array" && prop.items) {
        if (prop.items.enum) {
          tsType = `(${prop.items.enum.map((v: string) => JSON.stringify(v)).join(" | ")})[]`;
        } else {
          tsType = `${propItemsType(prop.items.type)}[]`;
        }
      } else {
        tsType = jsonSchemaToTs(prop.type);
      }
      merged[key] = { tsType, description: prop.description || "" };
    }
  }

  const lines: string[] = [];
  if (Object.keys(merged).length > 0) {
    lines.push("/**");
    lines.push(" * @typedef {Object} SpecshotTemplateData");
    for (const [key, { tsType, description }] of Object.entries(merged)) {
      const desc = description ? ` - ${description}` : "";
      lines.push(` * @property {${tsType}} [${key}]${desc}`);
    }
    lines.push(" */");
  }

  const registry = getRegistry(preset);
  const configKeys = new Set<string>();
  for (const tpl of registry) {
    if (tpl.configKey) configKeys.add(tpl.configKey);
  }
  if (configKeys.size > 0) {
    const keys = Array.from(configKeys).sort();
    lines.push("/**");
    lines.push(" * @typedef {Object} SpecshotTemplateOverrides");
    lines.push(' * @property {string} [dir]');
    for (const key of keys) {
      lines.push(` * @property {string} [${key}]`);
    }
    lines.push(" */");
  }

  return lines.join("\n");
}
