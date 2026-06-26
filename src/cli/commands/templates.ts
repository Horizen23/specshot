import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TemplatesOptions {
  output?: string;
  generatorOnly?: boolean;
  mswOnly?: boolean;
}

function getBuiltInTemplatesDir(): string {
  let dir = path.join(__dirname, "../../../templates");
  if (fs.existsSync(dir)) return dir;
  dir = path.join(__dirname, "../../templates");
  if (fs.existsSync(dir)) return dir;
  throw new Error("Could not locate built-in templates directory.");
}

function copyDir(src: string, dest: string): string[] {
  const copied: string[] = [];
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copied.push(...copyDir(srcPath, destPath));
    } else {
      fs.copyFileSync(srcPath, destPath);
      copied.push(path.relative(process.cwd(), destPath));
    }
  }
  return copied;
}

export async function templatesCommand(options: TemplatesOptions): Promise<void> {
  const outputDir = path.resolve(process.cwd(), options.output || "./templates");
  const builtInDir = getBuiltInTemplatesDir();

  const copyGenerator = !options.mswOnly;
  const copyMsw = !options.generatorOnly;

  if (!copyGenerator && !copyMsw) {
    console.error("Nothing to eject — specify --generator-only, --msw-only, or neither.");
    return;
  }

  console.log(`\nEjecting templates to ${path.relative(process.cwd(), outputDir)}/\n`);

  const allCopied: string[] = [];

  if (copyGenerator) {
    const generatorSrc = path.join(builtInDir, "generator");
    if (fs.existsSync(generatorSrc)) {
      const copied = copyDir(generatorSrc, outputDir);
      allCopied.push(...copied);
      console.log(`  generator/  → ${copied.length} files`);
    }
  }

  if (copyMsw) {
    const mswSrc = path.join(builtInDir, "msw");
    const mswDest = path.join(outputDir, "msw");
    if (fs.existsSync(mswSrc)) {
      const copied = copyDir(mswSrc, mswDest);
      allCopied.push(...copied);
      console.log(`  msw/        → ${copied.length} files`);
    }
  }

  console.log(`\nDone! ${allCopied.length} template files ejected.\n`);
  console.log("Next steps:");
  console.log("  1. Edit any .hbs file in the ejected directory");
  console.log("  2. Run generate with --templates:");
  if (options.output) {
    console.log(`     specshot generate --templates ${options.output}`);
  } else {
    console.log(`     specshot generate --templates ./templates`);
  }
  console.log("\nTip: Only the templates you edit will override the built-ins.");
  console.log("     Missing templates automatically fall back to defaults.\n");
}
