import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { generateApi } from "../../core/generate";
import { loadUserConfig } from "../../core/config-loader";
import type { TemplateOverrides } from "../../core/config-loader";
import { installCore, installProvider } from "../../core/installer";
import { showBanner } from "../ui/banner";

interface GenerateOptions {
  url?: string;
  file?: string;
  output?: string;
  alias?: string;
  config?: string;
  templates?: string;
  templateModels?: string;
  templateTypes?: string;
  templateService?: string;
  templateIndex?: string;
  templateInterceptorsIndex?: string;
  templateMswHandlers?: string;
  templateMswIndex?: string;
  templateMswBrowser?: string;
  dryRun?: boolean;
  msw?: boolean;
  interceptors?: string;
  watch?: boolean;
}

function mergeTemplateOverrides(
  options: GenerateOptions,
  configTemplates?: string | TemplateOverrides,
): string | TemplateOverrides | undefined {
  const cliFlags: TemplateOverrides = {};
  const cwd = process.cwd();
  if (options.templateModels)
    cliFlags.models = path.resolve(cwd, options.templateModels);
  if (options.templateTypes)
    cliFlags.types = path.resolve(cwd, options.templateTypes);
  if (options.templateService)
    cliFlags.service = path.resolve(cwd, options.templateService);
  if (options.templateIndex)
    cliFlags.index = path.resolve(cwd, options.templateIndex);
  if (options.templateInterceptorsIndex)
    cliFlags["interceptors-index"] = path.resolve(
      cwd,
      options.templateInterceptorsIndex,
    );
  if (options.templateMswHandlers || options.templateMswIndex || options.templateMswBrowser) {
    cliFlags.msw = {};
    if (options.templateMswHandlers)
      cliFlags.msw!.handlers = path.resolve(cwd, options.templateMswHandlers);
    if (options.templateMswIndex)
      cliFlags.msw!.index = path.resolve(cwd, options.templateMswIndex);
    if (options.templateMswBrowser)
      cliFlags.msw!.browser = path.resolve(cwd, options.templateMswBrowser);
  }

  const hasCliFlags = Object.keys(cliFlags).length > 0;
  if (!hasCliFlags) return options.templates || configTemplates;

  if (typeof configTemplates === "object" && configTemplates !== null) {
    return { ...configTemplates, ...cliFlags };
  }
  if (typeof configTemplates === "string") {
    return { dir: configTemplates, ...cliFlags };
  }
  return cliFlags;
}

function hasCustomTemplates(
  options: GenerateOptions,
  configTemplates?: string | TemplateOverrides,
): boolean {
  if (options.templates) return true;
  if (configTemplates) return true;
  if (
    options.templateModels ||
    options.templateTypes ||
    options.templateService ||
    options.templateIndex ||
    options.templateInterceptorsIndex
  )
    return true;
  return false;
}

function ensureInfrastructure(
  config: Awaited<ReturnType<typeof loadUserConfig>>,
  options: GenerateOptions,
  apiConfig: { providerDir?: string; openapiUrl?: string },
  apiName: string,
): void {
  if (hasCustomTemplates(options, config.templates)) return;
  if (!apiConfig.providerDir) return;

  const interceptors = config.interceptors || [];
  const integration = config.integration || "none";

  if (config.coreDir) {
    const installed = installCore({ coreDir: config.coreDir });
    if (installed) console.log(chalk.green(`✔ Core installed at ${config.coreDir}`));
  }

  const installed = installProvider({
    providerDir: apiConfig.providerDir,
    coreDir: config.coreDir || "src/lib/api/core",
    integration,
    interceptors,
    openapiUrl: apiConfig.openapiUrl,
  });
  if (installed)
    console.log(chalk.green(`✔ Provider skeleton installed at ${apiConfig.providerDir}`));
}

export async function generateCommand(options: GenerateOptions) {
  showBanner("SpecShot", "API Code Generation");

  let url = options.url;
  let file = options.file;
  let outputDir = options.output;
  let alias = options.alias;

  const config = await loadUserConfig(process.cwd(), options.config);

  if (!url && !file && config.apis && Object.keys(config.apis).length > 0) {
    // Generate all APIs defined in config.apis
    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      console.log(chalk.cyan(`\n--- Generating API: ${apiName} ---`));

      const apiSpecUrl = apiConfig.openapiUrl;
      const apiOutputDir = apiConfig.providerDir
        ? path.join(apiConfig.providerDir, "services")
        : apiConfig.outputPaths
          ? process.cwd()
          : "";

      if (!apiSpecUrl || !apiOutputDir) {
        if (apiConfig.providerDir) {
          ensureInfrastructure(config, options, apiConfig, apiName);
        }
        if (!apiSpecUrl) {
          console.warn(
            chalk.yellow(
              `Skipping ${apiName} generation due to missing openapiUrl.`,
            ),
          );
          continue;
        }
        if (!apiOutputDir) {
          console.warn(
            chalk.yellow(
              `Skipping ${apiName} due to missing providerDir or outputPaths.`,
            ),
          );
          continue;
        }
      }

      ensureInfrastructure(config, options, apiConfig, apiName);

      const mergedOptions = {
        ...options,
        url: apiSpecUrl,
        output: apiOutputDir,
      };
      // Note: In watch mode, we probably shouldn't loop easily without complex logic,
      // but for now we'll handle standard generation.

      const specSource = apiSpecUrl;
      const targetDir = path.resolve(process.cwd(), apiOutputDir);

      try {
        await generateApi(
          specSource,
          targetDir,
          alias || config.alias,
          mergeTemplateOverrides(options, config.templates),
          {
            configPath: options.config,
            msw: options.msw,
            mswOutputDir: apiConfig.mswOutputDir || config.mswOutputDir,
            interceptorsDir: apiConfig.interceptors
              ? path.join(apiConfig.providerDir || "", "interceptors")
              : options.interceptors,
            outputPaths: apiConfig.outputPaths,
            fileNaming: apiConfig.fileNaming,
          },
        );
        console.log(
          chalk.green(
            `API ${apiName} generated successfully at ${apiOutputDir}!`,
          ),
        );
      } catch (err) {
        console.error(chalk.red(`Failed to generate API ${apiName}`));
        console.error(err);
      }
    }

    if (options.watch) {
      console.warn(
        chalk.yellow(
          "\nWarning: Watch mode is not fully supported for multi-API generation yet.",
        ),
      );
    }
    return;
  }

  const firstApi = config.apis && Object.values(config.apis)[0];
  if (!url && !file && firstApi?.openapiUrl) url = firstApi.openapiUrl;
  if (!outputDir && firstApi?.providerDir)
    outputDir = path.join(firstApi.providerDir, "services");
  if (!alias && config.alias) alias = config.alias;

  if (firstApi && !hasCustomTemplates(options, config.templates)) {
    ensureInfrastructure(config, options, firstApi, "default");
  }

  const finalTemplates = mergeTemplateOverrides(options, config.templates);

  const specSource = file ? path.resolve(process.cwd(), file) : url;

  if (!specSource || !outputDir) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "specInput",
        message: "What is your OpenAPI JSON URL or local file path?",
        default: "http://localhost:8080/openapi.json",
        when: !specSource,
      },
      {
        type: "input",
        name: "outputDir",
        message: "Where should the services be generated?",
        default: "src/lib/api/default/services",
        when: !outputDir,
      },
    ]);
    if (!specSource) {
      const input: string = answers.specInput;
      url =
        input.startsWith("http://") || input.startsWith("https://")
          ? input
          : undefined;
      file = !url ? input : undefined;
    }
    outputDir = outputDir || answers.outputDir;
  }

  const sourceLabel = file ? file : url!;
  const targetDir = path.resolve(process.cwd(), outputDir!);
  const spinner = ora("Generating API services...").start();

  try {
    // Pause spinner because generateApi uses console.log internally
    spinner.stop();
    const runGenerate = async () => {
      try {
        if (options.dryRun) {
          console.log(
            chalk.cyan(
              `\n[DRY RUN] Would generate services from ${sourceLabel} to ${outputDir}`,
            ),
          );
          console.log(
            chalk.gray("  Templates: ") + (finalTemplates || "built-in"),
          );
          console.log(chalk.gray("  Alias:     ") + (alias || "none"));
          const spec = await generateApi(
            sourceLabel,
            targetDir,
            alias,
            finalTemplates,
            {
              dryRun: true,
              configPath: options.config,
              msw: options.msw,
              mswOutputDir: config.mswOutputDir,
              interceptorsDir: options.interceptors,
            },
          );
          console.log(chalk.gray(`  Endpoints: ${spec}`));
          return;
        }

        await generateApi(sourceLabel, targetDir, alias, finalTemplates, {
          configPath: options.config,
          msw: options.msw,
          mswOutputDir: config.mswOutputDir,
          interceptorsDir: options.interceptors,
        });

        console.log(
          chalk.green(`\nAPI services generated successfully at ${outputDir}!`),
        );

        if (options.watch) {
          console.log(
            chalk.cyan(`\nWatching for changes in ${sourceLabel}...`),
          );
        }
      } catch (err) {
        console.error(chalk.red("Failed to generate API services"));
        console.error(err);
      }
    };

    await runGenerate();

    if (options.watch) {
      if (
        sourceLabel.startsWith("http://") ||
        sourceLabel.startsWith("https://")
      ) {
        console.warn(
          chalk.yellow(
            "\nWarning: Watch mode is currently only supported for local files, not URLs. Polling is not implemented.",
          ),
        );
      } else {
        let timeout: NodeJS.Timeout | null = null;
        fs.watch(sourceLabel, (eventType) => {
          if (eventType === "change") {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(async () => {
              console.log(
                chalk.yellow(`\nFile ${sourceLabel} changed. Regenerating...`),
              );
              await runGenerate();
            }, 300); // Debounce to prevent double generation on save
          }
        });
      }
    }
  } catch (err) {
    spinner.fail(chalk.red("Failed to setup code generation"));
    console.error(err);
  }
}
