import fs from "fs";
import path from "path";
import Handlebars from "handlebars";

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
