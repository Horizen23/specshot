import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { loadUserConfig } from "../../core/config-loader";
import type { TemplateOverrides } from "../../core/config-loader";
import { getRegistry, getTemplateInfo, generateTypeFile, generateJSDocTypeDef } from "../../core/template-registry";
import { PRESETS, getPresetInfo, isValidPreset, DEFAULT_PRESET } from "../../core/presets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TemplatesOptions {
  output?: string;
  generatorOnly?: boolean;
  mswOnly?: boolean;
  preset?: string;
  repeatableOnly?: boolean;
}

function getBuiltInTemplatesDir(): string {
  let dir = path.join(__dirname, "../../../templates/presets");
  if (fs.existsSync(dir)) return dir;
  dir = path.join(__dirname, "../../templates/presets");
  if (fs.existsSync(dir)) return dir;
  throw new Error("Could not locate built-in templates directory.");
}

function getPresetDir(preset: string): string {
  const base = getBuiltInTemplatesDir();
  const presetDir = path.join(base, preset);
  if (fs.existsSync(presetDir)) return presetDir;
  throw new Error(`Preset '${preset}' not found at ${presetDir}`);
}

function countHbsFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countHbsFiles(fullPath);
    } else if (entry.name.endsWith(".hbs")) {
      count++;
    }
  }
  return count;
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
  const config = await loadUserConfig(process.cwd());
  const preset = options.preset || config.preset || DEFAULT_PRESET;

  if (!isValidPreset(preset)) {
    console.error(chalk.red(`Unknown preset: ${preset}`));
    console.log(chalk.gray("\nAvailable presets:"));
    for (const p of PRESETS) {
      console.log(chalk.gray(`  ${p.name.padEnd(16)} ${p.description}`));
    }
    return;
  }

  const info = getPresetInfo(preset)!;
  const outputDir = path.resolve(process.cwd(), options.output || "./templates");
  const presetDir = getPresetDir(preset);

  const copyGenerator = !options.mswOnly;
  const copyMsw = !options.generatorOnly;

  if (!copyGenerator && !copyMsw) {
    console.error("Nothing to eject — specify --generator-only, --msw-only, or neither.");
    return;
  }

  console.log(chalk.cyan(`\n  Preset: ${preset}`));
  console.log(chalk.gray(`  ${info.description}\n`));
  console.log(`  Ejecting to ${path.relative(process.cwd(), outputDir)}/\n`);

  const allCopied: string[] = [];

  // Eject from repeatable/ (generator + msw)
  const repeatableDir = path.join(presetDir, "repeatable");

  if (copyGenerator) {
    const generatorSrc = path.join(repeatableDir, "generator");
    if (fs.existsSync(generatorSrc)) {
      const copied = copyDir(generatorSrc, outputDir);
      allCopied.push(...copied);
      console.log(`  generator/  → ${copied.length} files`);
    }
  }

  if (copyMsw) {
    const mswSrc = path.join(repeatableDir, "msw");
    const mswDest = path.join(outputDir, "msw");
    if (fs.existsSync(mswSrc)) {
      const copied = copyDir(mswSrc, mswDest);
      allCopied.push(...copied);
      console.log(`  msw/        → ${copied.length} files`);
    }
  }

  // Also eject one-time/ scaffold templates if present
  const oneTimeDir = path.join(presetDir, "one-time");
  if (fs.existsSync(oneTimeDir) && !options.repeatableOnly) {
    const scaffoldDest = path.join(outputDir, "one-time");
    const copied = copyDir(oneTimeDir, scaffoldDest);
    allCopied.push(...copied);
    console.log(`  one-time/   → ${copied.length} files (scaffold templates)`);
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

export async function templatesListCommand(): Promise<void> {
  const config = await loadUserConfig(process.cwd());
  const builtInDir = getBuiltInTemplatesDir();
  const activePreset = config.preset || DEFAULT_PRESET;

  const tplConfig: TemplateOverrides =
    typeof config.templates === "string"
      ? { dir: config.templates }
      : (config.templates || {});

  const overrideDir = tplConfig.dir
    ? path.resolve(process.cwd(), tplConfig.dir)
    : undefined;

  console.log(chalk.cyan("\n  Templates\n  ---------\n"));

  // Show active preset
  const presetInfo = getPresetInfo(activePreset);
  if (presetInfo) {
    console.log(`  Active preset: ${chalk.bold(activePreset)}`);
    console.log(chalk.gray(`  ${presetInfo.description}\n`));
  }

  // List all presets
  console.log(chalk.gray("  Available presets:"));
  for (const p of PRESETS) {
    const marker = p.name === activePreset ? chalk.green(" ← active") : "";
    console.log(`    ${chalk.bold(p.name.padEnd(16))} ${chalk.gray(p.description)}${marker}`);
  }
  console.log();

  const presetDir = path.join(builtInDir, activePreset);
  const repeatableDir = path.join(presetDir, "repeatable");
  const oneTimeDir = path.join(presetDir, "one-time");

  // Show one-time (scaffold) templates
  if (fs.existsSync(oneTimeDir)) {
    console.log(chalk.gray("  One-time (scaffold — installed once, user-owned):"));
    const scaffoldDirs = fs.readdirSync(oneTimeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const dir of scaffoldDirs) {
      const dirPath = path.join(oneTimeDir, dir);
      const fileCount = countHbsFiles(dirPath);
      console.log(`    ${chalk.bold(dir.padEnd(22))} ${fileCount} file${fileCount !== 1 ? "s" : ""}`);
    }
    console.log();
  }

  // Show repeatable (generated) templates
  console.log(chalk.gray("  Repeatable (regenerated on every 'generate'):"));

  const allTemplates = getRegistry(activePreset);
  const groups: Array<{ label: string; templates: typeof allTemplates }> = [
    { label: "Generator", templates: allTemplates.filter((t) => t.group === "generator") },
    { label: "MSW", templates: allTemplates.filter((t) => t.group === "msw") },
  ];

  for (const group of groups) {
    console.log(chalk.gray(`  ${group.label}:`));
    for (const tpl of group.templates) {
      const builtInPath = path.join(repeatableDir, tpl.group, tpl.file);
      let status = "built-in";
      let resolvedPath = builtInPath;

      const perFileKey = tpl.configKey || tpl.name;
      const perFile = tplConfig[perFileKey] as string | undefined;
      if (typeof perFile === "string" && fs.existsSync(perFile)) {
        status = "per-file override";
        resolvedPath = perFile;
      } else if (overrideDir) {
        const overridePath = path.join(overrideDir, tpl.file);
        if (fs.existsSync(overridePath)) {
          status = "dir override";
          resolvedPath = overridePath;
        }
      }

      const statusColor =
        status === "built-in" ? chalk.gray(status) :
        status === "dir override" ? chalk.yellow(status) :
        chalk.green(status);

      console.log(`    ${chalk.bold(tpl.name.padEnd(22))} ${statusColor}`);
      console.log(chalk.gray(`      ${tpl.description}`));
      console.log(chalk.gray(`      ${path.relative(process.cwd(), resolvedPath)}`));
    }
    console.log();
  }

  if (!config.templates) {
    console.log(chalk.gray("  No custom templates configured."));
    console.log(chalk.gray("  Run 'specshot templates eject' to get started.\n"));
  }
}

export async function templatesContextCommand(templateName: string): Promise<void> {
  const info = getTemplateInfo(templateName);
  if (!info) {
    console.error(chalk.red(`Unknown template: ${templateName}`));
    console.log(chalk.gray("\nAvailable templates:"));
    for (const tpl of getRegistry()) {
      console.log(chalk.gray(`  ${tpl.name.padEnd(22)} ${tpl.description}`));
    }
    return;
  }

  console.log(chalk.cyan(`\n  ${info.name} (${info.file})\n`));
  console.log(chalk.gray(`  ${info.description}\n`));

  console.log(chalk.bold("  Variables:\n"));
  console.log(`    ${"Name".padEnd(28)} ${"Type".padEnd(28)} Description`);
  console.log(`    ${"-".repeat(27)}  ${"-".repeat(27)}  ${"-".repeat(40)}`);
  for (const v of info.variables) {
    console.log(`    ${v.name.padEnd(28)} ${v.type.padEnd(28)} ${v.description}`);
  }

  console.log(chalk.bold("\n  Naming Helpers (usable in any template):\n"));
  const helpers = [
    ["capitalize", "pets → Pets"],
    ["camelCase", "pet-store → petStore"],
    ["pascalCase", "pet-store → PetStore"],
    ["kebabCase", "PetStore → pet-store"],
    ["snakeCase", "PetStore → pet_store"],
    ["toLowerCase", "PetStore → petstore"],
    ["toUpperCase", "petstore → PETSTORE"],
    ["ifEq", "{{#ifEq tag 'pets'}}...{{/ifEq}}"],
    ["ifNeq", "{{#ifNeq tag 'users'}}...{{/ifNeq}}"],
  ];
  console.log(`    ${"Helper".padEnd(16)} Example`);
  console.log(`    ${"-".repeat(15)}  ${"-".repeat(40)}`);
  for (const [name, example] of helpers) {
    console.log(`    ${name.padEnd(16)} ${example}`);
  }
  console.log();
}

export async function templatesTypegenCommand(options: { preset?: string; output?: string }): Promise<void> {
  const typedefBlock = generateJSDocTypeDef(options.preset);
  const typeContent = generateTypeFile(options.preset);

  if (!typeContent) {
    console.log(chalk.gray("No template data schemas found for this preset."));
    console.log(chalk.gray("Add _template-data.schema.json to any template directory to define expected variables.\n"));
    return;
  }

  const fullOutput = `${typedefBlock}
/** @type {${typeContent}} */`;

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : undefined;

  if (outputPath) {
    fs.writeFileSync(outputPath, fullOutput + "\n");
    console.log(chalk.green(`\n✔ Type written to ${path.relative(process.cwd(), outputPath)}\n`));
  } else {
    console.log();
    console.log(fullOutput);
    console.log();
  }
}
