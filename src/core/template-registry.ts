import fs from "fs";
import path from "path";
import { getPresetDir } from "./paths";
import { toCamelCase } from "../utils/naming-utils";

export interface TemplateVariable {
  name: string;
  type: string;
  description: string;
}

export interface TemplateInfo {
  name: string;
  group: string;
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

function loadPresetTemplates(preset: string): TemplateInfo[] {
  const templates: TemplateInfo[] = [];
  const presetDir = getPresetDir(preset);
  if (!fs.existsSync(presetDir)) return templates;

  const repeatableDir = path.join(presetDir, "repeatable");
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
        group,
        file: path.join(entry, mainFile),
        description: entry,
        variables: [],
        configKey: toCamelCase(entry),
      });
    }
  }

  return templates;
}

let registryCache: Map<string, TemplateInfo[]> = new Map();

function getRegistryForPreset(preset: string): TemplateInfo[] {
  const cached = registryCache.get(preset);
  if (cached) return cached;
  const loaded = loadPresetTemplates(preset);
  registryCache.set(preset, loaded);
  return loaded;
}

export function getTemplateInfo(name: string, preset = "class"): TemplateInfo | undefined {
  return getRegistryForPreset(preset).find(
    (t) => t.name === name || t.file === name || t.configKey === name,
  );
}

export function getAllTemplateNames(preset = "class"): string[] {
  return getRegistryForPreset(preset).map((t) => t.name);
}

export function getRegistry(preset = "class"): TemplateInfo[] {
  return getRegistryForPreset(preset);
}

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
  const presetDir = getPresetDir(preset);
  if (!fs.existsSync(presetDir)) return schemas;

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

  scanDir(path.join(presetDir, "repeatable"));
  scanDir(path.join(presetDir, "one-time"));

  return schemas;
}

export function readSchemaDefaults(preset: string): Record<string, unknown> {
  const schemas = readAllSchemas(preset);
  const defaults: Record<string, unknown> = {};
  for (const schema of schemas) {
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      if (prop.default !== undefined) {
        defaults[key] = prop.default;
      }
    }
  }
  return defaults;
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
    lines.push(" * @typedef {Object} TemplateData");
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
    lines.push(" * @typedef {Object} Overrides");
    lines.push(' * @property {string} [dir]');
    for (const key of keys) {
      lines.push(` * @property {string} [${key}]`);
    }
    lines.push(" */");
  }

  return lines.join("\n");
}
