import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { compileTemplate, registerNamingHelpers } from "../utils/file-writer";
import {
  parseFrontmatter,
  stripFrontmatter,
  evaluateCondition,
  type TemplateFrontmatter,
} from "./frontmatter";

function walkHbsFiles(
  dir: string,
  rootDir?: string,
): Array<{ relPath: string; absPath: string }> {
  const root = rootDir ?? dir;
  const results: Array<{ relPath: string; absPath: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkHbsFiles(absPath, root));
    } else if (entry.name.endsWith(".hbs")) {
      results.push({ relPath: path.relative(root, absPath), absPath });
    }
  }
  return results;
}

function renderValue(
  value: string | undefined,
  data: Record<string, unknown>,
): string | undefined {
  if (!value) return undefined;
  if (value.includes("{{")) {
    return Handlebars.compile(value)(data).trim();
  }
  return value;
}

function renderFilter(
  filterLines: string[] | undefined,
  data: Record<string, unknown>,
): Set<string> | null {
  if (!filterLines || filterLines.length === 0) return null;
  const templateContent = filterLines.join("\n");
  const compiled = Handlebars.compile(templateContent);
  const rendered = compiled(data);
  const lines = rendered
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? new Set(lines) : null;
}

import { formatContent } from "../utils/formatter";

export interface TemplateRendererOptions {
  templateDir: string;
  data: Record<string, unknown>;
  silent?: boolean;
  skipIfExists?: boolean;
  enhanceData?: (info: {
    relPath: string;
    templateName: string;
    outputPath: string;
  }) => Record<string, unknown>;
  defaultTarget?: string;
  behavior?: "scaffold" | "generated";
}

export async function renderTemplates(
  options: TemplateRendererOptions,
): Promise<string[]> {
  registerNamingHelpers();
  const { templateDir, data, silent, behavior } = options;
  const hbsFiles = walkHbsFiles(templateDir);
  const generated: string[] = [];

  for (const { relPath, absPath } of hbsFiles) {
    const basename = path.basename(relPath);
    if (basename.startsWith("_")) continue;

    const rawContent = fs.readFileSync(absPath, "utf8");
    const meta = parseFrontmatter(rawContent) || {};

    const dir = path.dirname(absPath);
    if (meta.behavior === undefined) {
      const p = path.join(dir, "_behavior.hbs");
      if (fs.existsSync(p))
        meta.behavior = fs.readFileSync(p, "utf8").trim() as any;
    }
    if (meta.target === undefined) {
      const p = path.join(dir, "_target.hbs");
      if (fs.existsSync(p)) meta.target = fs.readFileSync(p, "utf8").trim();
    }
    if (meta.name === undefined) {
      const p = path.join(dir, "_name.hbs");
      if (fs.existsSync(p)) meta.name = fs.readFileSync(p, "utf8").trim();
    }
    if (meta.iterate === undefined) {
      const p = path.join(dir, "_iterate.hbs");
      if (fs.existsSync(p)) meta.iterate = fs.readFileSync(p, "utf8").trim();
    }
    if (meta.condition === undefined) {
      const p = path.join(dir, "_condition.hbs");
      if (fs.existsSync(p)) meta.condition = fs.readFileSync(p, "utf8").trim();
    }
    if (meta.filter === undefined) {
      const p = path.join(dir, "_filter.hbs");
      if (fs.existsSync(p)) {
        meta.filter = fs
          .readFileSync(p, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
      }
    }

    if (meta.behavior && behavior && meta.behavior !== behavior) continue;

    if (meta.condition) {
      const renderedCondition = renderValue(meta.condition, data);
      if (renderedCondition === "skip") continue;
      if (renderedCondition && !evaluateCondition(renderedCondition, data))
        continue;
    }

    const filterList = renderFilter(meta.filter, data);
    if (filterList !== null && !filterList.has(basename)) continue;

    const templateName = basename.replace(/\.hbs$/, "");

    const iterateKey = meta?.iterate;
    const iterationList = iterateKey ? (data[iterateKey] as unknown[]) : null;
    const items = iterationList ?? [null];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemCtx: Record<string, unknown> = {
        ...data,
        templateName,
        ...(typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {}),
        item,
        itemIndex: idx,
      };

      let target = renderValue(meta?.target, itemCtx);
      if (!target) {
        const fromData = itemCtx["_target"];
        if (typeof fromData === "string") {
          target = fromData;
        } else if (options.defaultTarget) {
          target = options.defaultTarget;
        } else {
          if (!silent)
            console.warn(`  Skipping ${relPath}: no target in frontmatter`);
          continue;
        }
      }

      const namePattern = renderValue(meta?.name, itemCtx);
      const outputFileName = namePattern || `${templateName}.ts`;
      const outputFullPath = path.resolve(
        process.cwd(),
        target,
        outputFileName,
      );

      if (options.skipIfExists && fs.existsSync(outputFullPath)) continue;

      if (options.enhanceData) {
        const extra = options.enhanceData({
          relPath,
          templateName,
          outputPath: outputFullPath,
        });
        if (extra) Object.assign(itemCtx, extra);
      }

      const stripped = stripFrontmatter(rawContent);
      const compiled = Handlebars.compile(stripped);
      const content = compiled(itemCtx);
      if (!content.trim()) continue;

      const outDir = path.dirname(outputFullPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const formattedContent = await formatContent(content, outputFullPath);
      fs.writeFileSync(outputFullPath, formattedContent);
      if (!silent) console.log(`  Generated ${outputFileName}`);
      generated.push(outputFullPath);
    }
  }

  return generated;
}
