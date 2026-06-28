import fs from "fs";
import path from "path";
import { compileTemplate } from "../utils/file-writer";

function walkHbsFiles(dir: string, rootDir?: string): Array<{ relPath: string; absPath: string }> {
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

function resolveNearestMeta(
  fileRelPath: string,
  templateDir: string,
  metaFile: string,
  data: Record<string, unknown>,
): string | null {
  const parts = fileRelPath.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const subParts = parts.slice(0, i - 1);
    const dir = subParts.length > 0 ? path.join(templateDir, ...subParts) : templateDir;
    const metaPath = path.join(dir, metaFile);
    if (fs.existsSync(metaPath)) {
      const compiled = compileTemplate(metaPath);
      const rendered = compiled(data).trim();
      if (rendered) return rendered;
    }
  }
  return null;
}

function getIterationList(
  fileRelPath: string,
  templateDir: string,
  data: Record<string, unknown>,
): unknown[] | null {
  const result = resolveNearestMeta(fileRelPath, templateDir, "_iterate.hbs", data);
  if (!result) return null;
  const list = data[result];
  return Array.isArray(list) ? list : null;
}

function shouldSkip(
  fileRelPath: string,
  templateDir: string,
  data: Record<string, unknown>,
): boolean {
  const result = resolveNearestMeta(fileRelPath, templateDir, "_condition.hbs", data);
  return result === "skip";
}

function getFilterList(
  fileRelPath: string,
  templateDir: string,
  data: Record<string, unknown>,
): Set<string> | null {
  const result = resolveNearestMeta(fileRelPath, templateDir, "_filter.hbs", data);
  if (!result) return null;
  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  return new Set(lines);
}

function resolveTarget(
  fileRelPath: string,
  templateDir: string,
  data: Record<string, unknown>,
): string | null {
  const meta = resolveNearestMeta(fileRelPath, templateDir, "_target.hbs", data);
  if (meta) return meta;
  const fromData = data["_target"];
  if (typeof fromData === "string") return fromData;
  return null;
}

function resolveName(
  fileRelPath: string,
  templateDir: string,
  data: Record<string, unknown>,
): string | null {
  return resolveNearestMeta(fileRelPath, templateDir, "_name.hbs", data);
}

export interface TemplateRendererOptions {
  templateDir: string;
  data: Record<string, unknown>;
  silent?: boolean;
  skipIfExists?: boolean;
  enhanceData?: (info: { relPath: string; templateName: string; outputPath: string }) => Record<string, unknown>;
  defaultTarget?: string;
}

export function renderTemplates(options: TemplateRendererOptions): string[] {
  const { templateDir, data, silent } = options;
  const hbsFiles = walkHbsFiles(templateDir);
  const generated: string[] = []

  for (const { relPath, absPath } of hbsFiles) {
    const basename = path.basename(relPath);
    if (basename.startsWith("_")) continue;

    if (shouldSkip(relPath, templateDir, data)) continue;

    const filterList = getFilterList(relPath, templateDir, data);
    if (filterList !== null && !filterList.has(basename)) continue;

    const templateName = basename.replace(/\.hbs$/, "");
    const iterationList = getIterationList(relPath, templateDir, data);
    const items = iterationList ?? [null];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemCtx: Record<string, unknown> = {
        ...data,
        templateName,
        ...(typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {}),
        item,
        itemIndex: idx,
      };

      let target = resolveTarget(relPath, templateDir, itemCtx);
      if (!target) {
        if (options.defaultTarget) {
          target = options.defaultTarget;
        } else {
          if (!silent) console.warn(`  Skipping ${relPath}: no _target.hbs found`);
          continue;
        }
      }

      const namePattern = resolveName(relPath, templateDir, itemCtx);
      const outputFileName = namePattern || `${templateName}.ts`;
      const outputFullPath = path.resolve(process.cwd(), target!, outputFileName);

      if (options.skipIfExists && fs.existsSync(outputFullPath)) continue;

      if (options.enhanceData) {
        const extra = options.enhanceData({
          relPath,
          templateName,
          outputPath: outputFullPath,
        });
        if (extra) Object.assign(itemCtx, extra);
      }

      const compiled = compileTemplate(absPath);
      const content = compiled(itemCtx);
      if (!content.trim()) continue;

      const outDir = path.dirname(outputFullPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outputFullPath, content);
      if (!silent) console.log(`  Generated ${outputFileName}`);
      generated.push(outputFileName);
    }
  }

  return generated;
}
