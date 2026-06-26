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

function registerNamingHelpers(): void {
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
  try {
    const hbs = fs.readFileSync(hbsPath, "utf8");
    return Handlebars.compile(hbs);
  } catch (e) {
    throw new Error(
      `Failed to compile template ${path.basename(hbsPath)}: ${(e as Error).message}`,
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
