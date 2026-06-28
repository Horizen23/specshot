import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import {
  capitalize,
  toCamelCase,
  toPascalCase,
  toKebabCase,
  toSnakeCase,
  toLowerCase,
  toUpperCase,
} from "./naming-utils";

let helpersRegistered = false;

export function registerNamingHelpers(): void {
  if (helpersRegistered) return;
  helpersRegistered = true;

  Handlebars.registerHelper("capitalize", capitalize);
  Handlebars.registerHelper("camelCase", toCamelCase);
  Handlebars.registerHelper("pascalCase", toPascalCase);
  Handlebars.registerHelper("kebabCase", toKebabCase);
  Handlebars.registerHelper("snakeCase", toSnakeCase);
  Handlebars.registerHelper("toLowerCase", toLowerCase);
  Handlebars.registerHelper("toUpperCase", toUpperCase);

  Handlebars.registerHelper("ifEq", function (this: unknown, a: unknown, b: unknown, opts: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string }) {
    return a === b ? opts.fn(this) : opts.inverse(this);
  });

  Handlebars.registerHelper("ifNeq", function (this: unknown, a: unknown, b: unknown, opts: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string }) {
    return a !== b ? opts.fn(this) : opts.inverse(this);
  });

  Handlebars.registerHelper("split", (str: string, sep: string) => {
    if (!str || typeof str !== "string") return [];
    return str.split(sep).map((s) => s.trim());
  });

  Handlebars.registerHelper("includes", (arr: unknown[], val: unknown) => {
    if (!Array.isArray(arr)) return false;
    return arr.includes(val);
  });

  Handlebars.registerHelper("join", (arr: unknown[], sep: string) => {
    if (!Array.isArray(arr)) return "";
    return arr.join(sep);
  });

  Handlebars.registerHelper("concat", (...args: unknown[]) => {
    // Last arg is the `options` object from Handlebars
    const parts = args.slice(0, -1).map((a) => String(a ?? ""));
    return parts.join("");
  });

  // ── File system discovery helpers (templates scan their own output dir) ──
  Handlebars.registerHelper("hasFile", function (this: unknown, relPath: string, opts?: { fn: (ctx: unknown) => string; inverse: (ctx: unknown) => string }) {
    const cwd = process.cwd();
    const full = path.resolve(cwd, relPath);
    const exists = fs.existsSync(full);
    if (opts) return exists ? opts.fn(this) : opts.inverse(this);
    return exists;
  });

  Handlebars.registerHelper("scanPlugins", (dirRelPath: string) => {
    const cwd = process.cwd();
    const dir = path.resolve(cwd, dirRelPath);
    if (!fs.existsSync(dir)) return [];
    const plugins: { file: string; fn: string }[] = [];
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".ts") || entry === "index.ts") continue;
      const content = fs.readFileSync(path.join(dir, entry), "utf8");
      const matches = content.matchAll(/export function (install\w+)/g);
      for (const m of matches) {
        plugins.push({ file: entry.replace(/\.ts$/, ""), fn: m[1] });
      }
    }
    return plugins;
  });

  Handlebars.registerHelper("relPath", (fromRel: string, toRel: string) => {
    const cwd = process.cwd();
    const from = path.resolve(cwd, fromRel);
    const to = path.resolve(cwd, toRel);
    let rel = path.relative(from, to).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  });
}

export function extractCustomCode(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(
    /\/\/ --- CUSTOM CODE START ---([\s\S]*?)\/\/ --- CUSTOM CODE END ---/,
  );
  if (match && match[1]) {
    return match[1].replace(/^\n|\n$/g, "");
  }
  return null;
}

export function compileTemplate(hbsPath: string): Handlebars.TemplateDelegate {
  registerNamingHelpers();
  const displayName = path.basename(hbsPath);
  let hbs: string;
  try {
    hbs = fs.readFileSync(hbsPath, "utf8");
  } catch (e) {
    throw new Error(
      `Template file not found: ${displayName}\n  Path: ${hbsPath}\n  ${(e as Error).message}`,
    );
  }
  try {
    return Handlebars.compile(hbs);
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(
      `Template syntax error in ${displayName}:\n  ${msg}\n  Path: ${hbsPath}`,
    );
  }
}

export function renderTemplate(
  template: Handlebars.TemplateDelegate,
  data: unknown,
  templateName: string,
): string {
  try {
    return template(data);
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(
      `Template render error in ${templateName}:\n  ${msg}\n  Check that all variables used in the template are provided.`,
    );
  }
}

export function writeGenerated(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
  } catch (e) {
    throw new Error(
      `Failed to write ${path.basename(filePath)}: ${(e as Error).message}`,
    );
  }
}

export function resolveTemplatePath(
  filename: string,
  overrideDir: string | undefined,
  defaultDir: string,
  perFileOverride?: string,
): string {
  if (perFileOverride && fs.existsSync(perFileOverride)) return perFileOverride;
  if (overrideDir) {
    const overridePath = path.join(overrideDir, filename);
    if (fs.existsSync(overridePath)) return overridePath;
  }
  return path.join(defaultDir, filename);
}
