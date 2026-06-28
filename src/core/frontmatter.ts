import fs from "fs";

export interface TemplateFrontmatter {
  behavior?: "scaffold" | "generated";
  target?: string;
  name?: string;
  iterate?: string;
  condition?: string;
  filter?: string[];
}

const FRONTMATTER_REGEX = /^\{\{!--\s*---\n([\s\S]*?)\n---\s*--\}\}/;

export function parseFrontmatter(content: string): TemplateFrontmatter | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return null;

  const block = match[1];
  const meta: TemplateFrontmatter = {};
  const filterLines: string[] = [];
  let inFilter = false;

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (inFilter) {
      filterLines.push(trimmed.replace(/^-\s*/, ""));
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    switch (key) {
      case "behavior":
        if (value === "scaffold" || value === "generated") meta.behavior = value;
        break;
      case "target":
        meta.target = value;
        break;
      case "name":
        meta.name = value;
        break;
      case "iterate":
        meta.iterate = value;
        break;
      case "condition":
        meta.condition = value;
        break;
      case "filter":
        inFilter = true;
        if (value) filterLines.push(value);
        break;
    }
  }

  if (filterLines.length > 0) meta.filter = filterLines;

  return meta;
}

export function readFrontmatter(filePath: string): TemplateFrontmatter | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  return parseFrontmatter(content);
}

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_REGEX, "").trimStart();
}

export function evaluateCondition(
  expr: string,
  data: Record<string, unknown>,
): boolean {
  const neMatch = expr.match(/^(\w+)\s*!=\s*"(.+)"$/);
  if (neMatch) return data[neMatch[1]] !== neMatch[2];

  const eqMatch = expr.match(/^(\w+)\s*==\s*"(.+)"$/);
  if (eqMatch) return data[eqMatch[1]] === eqMatch[2];

  const notMatch = expr.match(/^!(\w+)$/);
  if (notMatch) return !data[notMatch[1]];

  return !!data[expr];
}
