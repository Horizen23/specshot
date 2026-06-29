import fs from "fs";
import path from "path";
import chalk from "chalk";
import { loadUserConfig } from "../../core/config-loader";
import type { TemplateOverrides } from "../../core/config-loader";
import {
  getRegistry,
  getTemplateInfo,
  generateTypeFile,
  generateJSDocTypeDef,
} from "../../core/template-registry";
import {
  getAvailablePresets,
  getPresetInfo,
  isValidPreset,
  validatePresetStructure,
  DEFAULT_PRESET,
} from "../../core/presets";
import {
  getTemplatesBaseDir,
  getPresetDir as getPresetDirFromPaths,
  getPresetTemplatesDir,
  getOutputTypes,
  getTemplateNames,
  getTemplateBehavior,
} from "../../core/paths";

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

export async function templatesEjectPresetCommand(
  presetName: string,
  nameOverride?: string,
): Promise<void> {
  const targetName = nameOverride ? nameOverride : presetName;
  console.log(
    chalk.cyan(
      `\n  Ejecting preset: ${presetName}${nameOverride ? ` as ${targetName}` : ""}\n`,
    ),
  );

  // Validate source exists
  if (!isValidPreset(presetName)) {
    console.error(chalk.red(`  Preset "${presetName}" not found`));
    console.log(chalk.gray("\n  Available presets:"));
    for (const p of getAvailablePresets()) {
      const tag =
        p.source === "built-in"
          ? chalk.blue(" [built-in]")
          : p.source === "community"
            ? chalk.yellow(" [community]")
            : chalk.magenta(" [custom]");
      console.log(
        chalk.gray(`    ${p.name.padEnd(16)} ${p.description}${tag}`),
      );
    }
    console.log();
    return;
  }

  const info = getPresetInfo(presetName)!;

  // Determine source dir (from package dir — built-in or community)
  const srcDir = getPresetDirFromPaths(presetName);

  // Destination: project's templates/presets/<targetName>/
  const projectPresetsDir = path.resolve(
    process.cwd(),
    ".specshot/templates/presets",
  );
  const destDir = path.join(projectPresetsDir, targetName);

  if (fs.existsSync(destDir)) {
    console.error(
      chalk.red(
        `  Preset "${targetName}" already exists at .specshot/templates/presets/${targetName}/`,
      ),
    );
    console.log(chalk.gray(`  Remove it first or choose a different name.\n`));
    return;
  }

  // Confirm before ejecting
  const { default: inquirer } = await import("inquirer");
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Eject preset "${presetName}" to .specshot/templates/presets/${targetName}/?`,
      default: true,
    },
  ]);
  if (!confirm) {
    console.log(chalk.gray("  Cancelled.\n"));
    return;
  }

  // Ensure parent dir exists
  if (!fs.existsSync(projectPresetsDir)) {
    fs.mkdirSync(projectPresetsDir, { recursive: true });
  }

  // Copy entire preset directory
  const copied = copyDir(srcDir, destDir);

  // Update _preset.json if we have a name override
  if (nameOverride) {
    const presetJsonPath = path.join(destDir, "_preset.json");
    if (fs.existsSync(presetJsonPath)) {
      try {
        const raw = fs.readFileSync(presetJsonPath, "utf8");
        const data = JSON.parse(raw);
        data.name = targetName;
        fs.writeFileSync(presetJsonPath, JSON.stringify(data, null, 2));
      } catch (err) {
        console.warn(
          chalk.yellow(`  Failed to update _preset.json with new name: ${err}`),
        );
      }
    }
  }

  console.log(
    chalk.green(
      `  ✔ Ejected preset "${presetName}" to .specshot/templates/presets/${targetName}/\n`,
    ),
  );
  console.log(chalk.gray(`  ${copied.length} files copied\n`));

  // Show info
  console.log(chalk.gray("  Preset info:"));
  console.log(chalk.gray(`    name:        ${info.name}`));
  console.log(chalk.gray(`    description: ${info.description}`));
  if (info.deps.length > 0) {
    console.log(chalk.gray(`    deps:        ${info.deps.join(", ")}`));
  }

  console.log(
    chalk.cyan(`\n  The preset is now [custom] — edit any .hbs file in:`),
  );
  console.log(`    .specshot/templates/presets/${targetName}/\n`);
  console.log(
    chalk.gray(
      "  It will appear in 'specshot templates list' as [custom] automatically.\n",
    ),
  );
}

export async function templatesListCommand(): Promise<void> {
  const config = await loadUserConfig(process.cwd());
  const activePreset = config.preset || DEFAULT_PRESET;

  const tplConfig: TemplateOverrides =
    typeof config.templates === "string"
      ? { dir: config.templates }
      : config.templates || {};

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
  for (const p of getAvailablePresets()) {
    const marker = p.name === activePreset ? chalk.green(" ← active") : "";
    const sourceTag =
      p.source === "built-in"
        ? chalk.blue(" [built-in]")
        : p.source === "community"
          ? chalk.yellow(" [community]")
          : chalk.magenta(" [custom]");
    console.log(
      `    ${chalk.bold(p.name.padEnd(16))} ${chalk.gray(p.description)}${sourceTag}${marker}`,
    );
  }
  console.log();

  const presetDir = getPresetDirFromPaths(activePreset);
  const templatesDir = getPresetTemplatesDir(activePreset);

  // Show scaffold templates (behavior: scaffold)
  const allTemplates = getRegistry(activePreset);
  const scaffoldTpls = allTemplates.filter((tpl) => {
    const tplDir = path.join(templatesDir, tpl.group, tpl.name);
    return getTemplateBehavior(tplDir) === "scaffold";
  });
  const generatedTpls = allTemplates.filter(
    (tpl) => !scaffoldTpls.includes(tpl),
  );

  if (scaffoldTpls.length > 0) {
    console.log(chalk.gray("  Scaffold (installed once, user-owned):"));
    for (const tpl of scaffoldTpls) {
      const tplDir = path.join(templatesDir, tpl.group, tpl.name);
      const fileCount = countHbsFiles(tplDir);
      console.log(
        `    ${chalk.bold(tpl.name.padEnd(22))} ${chalk.gray(tpl.group)} ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
      );
    }
    console.log();
  }

  // Show generated templates (behavior: generated)
  console.log(chalk.gray("  Generated (regenerated on every 'generate'):"));

  const groupMap = new Map<string, typeof allTemplates>();
  for (const tpl of generatedTpls) {
    const list = groupMap.get(tpl.group) || [];
    list.push(tpl);
    groupMap.set(tpl.group, list);
  }
  const groups: Array<{ label: string; templates: typeof allTemplates }> = [];
  for (const [group, templates] of groupMap) {
    groups.push({ label: group, templates });
  }

  for (const group of groups) {
    console.log(chalk.gray(`  ${group.label}:`));
    for (const tpl of group.templates) {
      const builtInPath = path.join(templatesDir, tpl.group, tpl.name);
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
        status === "built-in"
          ? chalk.gray(status)
          : status === "dir override"
            ? chalk.yellow(status)
            : chalk.green(status);

      console.log(`    ${chalk.bold(tpl.name.padEnd(22))} ${statusColor}`);
      console.log(chalk.gray(`      ${tpl.description}`));
      console.log(
        chalk.gray(`      ${path.relative(process.cwd(), resolvedPath)}`),
      );
    }
    console.log();
  }

  if (!config.templates) {
    console.log(chalk.gray("  No custom templates configured."));
    console.log(
      chalk.gray("  Run 'specshot templates eject' to get started.\n"),
    );
  }
}

export async function templatesContextCommand(
  templateName: string,
): Promise<void> {
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
    console.log(
      `    ${v.name.padEnd(28)} ${v.type.padEnd(28)} ${v.description}`,
    );
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

export async function templatesTypegenCommand(options: {
  preset?: string;
  output?: string;
}): Promise<void> {
  const typedefBlock = generateJSDocTypeDef(options.preset);
  const typeContent = generateTypeFile(options.preset);

  if (!typeContent) {
    console.log(chalk.gray("No template data schemas found for this preset."));
    console.log(
      chalk.gray(
        "Add _template-data.schema.json to any template directory to define expected variables.\n",
      ),
    );
    return;
  }

  const fullOutput = `${typedefBlock}
/** @type {${typeContent}} */`;

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : undefined;

  if (outputPath) {
    fs.writeFileSync(outputPath, fullOutput + "\n");
    console.log(
      chalk.green(
        `\n✔ Type written to ${path.relative(process.cwd(), outputPath)}\n`,
      ),
    );
  } else {
    console.log();
    console.log(fullOutput);
    console.log();
  }
}

export async function templatesValidateCommand(options: {
  preset?: string;
}): Promise<void> {
  const config = await loadUserConfig(process.cwd());
  const preset = options.preset || config.preset || DEFAULT_PRESET;

  console.log(chalk.cyan(`\n  Validating preset: ${preset}\n`));

  const errors = validatePresetStructure(preset);

  if (errors.length === 0) {
    console.log(chalk.green("  ✔ Preset structure is valid\n"));
  } else {
    console.log(chalk.red(`  ✘ Found ${errors.length} issue(s):\n`));
    for (const err of errors) {
      console.log(chalk.red(`    - ${err}`));
    }
    console.log();
  }

  const info = getPresetInfo(preset);
  if (info) {
    console.log(chalk.gray("  Preset info:"));
    console.log(chalk.gray(`    name:        ${info.name}`));
    console.log(chalk.gray(`    description: ${info.description}`));
    if (info.features.length > 0) {
      console.log(chalk.gray(`    features:    ${info.features.join(", ")}`));
    }
    if (info.deps.length > 0) {
      console.log(chalk.gray(`    deps:        ${info.deps.join(", ")}`));
    }
    console.log();
  }
}

export async function templatesInstallCommand(
  packageName: string,
  nameOverride?: string,
): Promise<void> {
  console.log(chalk.cyan(`\n  Installing preset from: ${packageName}\n`));

  let srcDir: string;
  let presetName: string;
  let tempDir: string | null = null;

  // Detect GitHub references
  const githubMatch = parseGithubRef(packageName);

  if (githubMatch) {
    // Clone from GitHub
    tempDir = path.join(process.cwd(), `.specshot-tmp-${Date.now()}`);
    const cloneUrl = `https://github.com/${githubMatch.owner}/${githubMatch.repo}.git`;
    console.log(chalk.gray(`  Cloning ${cloneUrl}...`));

    try {
      const { execSync } = await import("child_process");
      execSync(`git clone --depth 1 ${cloneUrl} "${tempDir}"`, {
        stdio: "pipe",
        timeout: 30000,
      });
    } catch (err) {
      console.error(chalk.red(`  Failed to clone from GitHub`));
      const stderr =
        err instanceof Error && "stderr" in err
          ? (err as { stderr: Buffer }).stderr?.toString()
          : "";
      if (stderr) {
        console.log(chalk.gray(`  ${stderr.trim().split("\n")[0]}`));
      }
      console.log(
        chalk.gray(`  Check the URL, or make sure the repo is public.\n`),
      );
      cleanupTemp(tempDir);
      return;
    }

    srcDir = tempDir;
    presetName = githubMatch.repo
      .replace(/^specshot-preset-/, "")
      .replace(/^specshot-/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  } else {
    // Try npm package from node_modules
    const resolvedPath = path.resolve(
      process.cwd(),
      "node_modules",
      packageName,
    );
    if (!fs.existsSync(resolvedPath)) {
      console.error(
        chalk.red(`  Package "${packageName}" not found in node_modules`),
      );
      console.log(chalk.gray(`\n  Try one of:`));
      console.log(
        chalk.gray(
          `    npm install ${packageName}  &&  specshot templates install ${packageName}`,
        ),
      );
      console.log(
        chalk.gray(`    specshot templates install github:user/repo`),
      );
      console.log(
        chalk.gray(
          `    specshot templates install https://github.com/user/repo\n`,
        ),
      );
      return;
    }
    srcDir = resolvedPath;
    presetName = packageName
      .replace(/^@[^/]+\//, "")
      .replace(/^specshot-preset-/, "")
      .replace(/^specshot-/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  if (!presetName) {
    console.error(
      chalk.red(`  Could not determine preset name from "${packageName}"`),
    );
    console.log(
      chalk.gray(
        `  Use: specshot templates install <npm-package> --name <preset-name>\n`,
      ),
    );
    cleanupTemp(tempDir);
    return;
  }

  // Apply name override if provided
  if (nameOverride) {
    presetName = nameOverride
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  // Validate source has preset structure
  const hasPresetJson = fs.existsSync(path.join(srcDir, "_preset.json"));
  const hasTemplates = fs.existsSync(path.join(srcDir, "templates"));

  if (!hasPresetJson && !hasTemplates) {
    // Maybe it's nested — look for preset dir inside
    const innerDirs = fs
      .readdirSync(srcDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const presetInner = innerDirs.find((d) => {
      const innerPath = path.join(srcDir, d);
      return (
        fs.existsSync(path.join(innerPath, "_preset.json")) ||
        fs.existsSync(path.join(innerPath, "templates"))
      );
    });
    if (presetInner) {
      srcDir = path.join(srcDir, presetInner);
    } else {
      console.error(chalk.red(`  Source does not look like a specshot preset`));
      console.log(
        chalk.gray(`  Expected _preset.json or templates/ directory\n`),
      );
      cleanupTemp(tempDir);
      return;
    }
  }

  const projectPresetsDir = path.resolve(
    process.cwd(),
    ".specshot/templates/presets",
  );
  const destDir = path.join(projectPresetsDir, presetName);

  if (!fs.existsSync(projectPresetsDir)) {
    fs.mkdirSync(projectPresetsDir, { recursive: true });
  }

  if (fs.existsSync(destDir)) {
    console.error(
      chalk.red(`  Preset "${presetName}" already exists at ${destDir}`),
    );
    console.log(chalk.gray(`  Remove it first or choose a different name.\n`));
    cleanupTemp(tempDir);
    return;
  }

  // Copy the preset
  copyDir(srcDir, destDir);
  cleanupTemp(tempDir);

  console.log(
    chalk.green(
      `  ✔ Installed preset "${presetName}" to .specshot/templates/presets/${presetName}/\n`,
    ),
  );

  // Validate
  const errors = validatePresetStructure(presetName);
  if (errors.length > 0) {
    console.log(chalk.yellow(`  ⚠ Warnings:`));
    for (const err of errors) {
      console.log(chalk.yellow(`    - ${err}`));
    }
    console.log();
  }

  // Show info
  const info = getPresetInfo(presetName);
  if (info) {
    console.log(chalk.gray(`  name:        ${info.name}`));
    console.log(chalk.gray(`  description: ${info.description}`));
    if (info.deps.length > 0) {
      console.log(chalk.gray(`  deps:        ${info.deps.join(", ")}`));
    }
  }

  console.log(chalk.cyan(`\n  Use it with:`));
  console.log(`    specshot init --preset ${presetName}`);
  console.log(`    specshot generate --preset ${presetName}\n`);
}

interface GithubRef {
  owner: string;
  repo: string;
}

function parseGithubRef(input: string): GithubRef | null {
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // https://github.com/owner/repo/tree/main/preset-dir
  const httpsMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
  }

  // github:owner/repo
  const shorthandMatch = input.match(/^github:([^/]+)\/([^/]+)/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  // owner/repo (only if it looks like GitHub — contains slash, no dots before slash)
  const slashMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slashMatch && !input.includes("@")) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }

  return null;
}

function cleanupTemp(dir: string | null): void {
  if (dir && fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

export async function templatesUninstallCommand(
  presetName: string,
): Promise<void> {
  console.log(chalk.cyan(`\n  Uninstalling preset: ${presetName}\n`));

  const presetDir = getPresetDirFromPaths(presetName);

  if (!fs.existsSync(presetDir)) {
    console.error(chalk.red(`  Preset "${presetName}" not found`));
    console.log(chalk.gray(`\n  Available presets:`));
    for (const p of getAvailablePresets()) {
      console.log(chalk.gray(`    ${p.name}`));
    }
    console.log();
    return;
  }

  // Check if it's a built-in preset (exists in the package dir)
  const pkgPresetDir = path.join(getTemplatesBaseDir(), presetName);
  if (
    fs.existsSync(pkgPresetDir) &&
    !fs.existsSync(path.join(presetDir, "_preset.json"))
  ) {
    console.error(
      chalk.red(`  Cannot uninstall built-in preset "${presetName}"`),
    );
    console.log(
      chalk.gray(
        `  Built-in presets are part of specshot and cannot be removed.\n`,
      ),
    );
    return;
  }

  // Confirm
  console.log(chalk.gray(`  This will remove:`));
  console.log(chalk.gray(`    ${presetDir}\n`));

  const { default: inquirer } = await import("inquirer");
  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Remove preset "${presetName}"?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray("  Cancelled.\n"));
    return;
  }

  fs.rmSync(presetDir, { recursive: true, force: true });
  console.log(chalk.green(`  ✔ Removed preset "${presetName}"\n`));
}
