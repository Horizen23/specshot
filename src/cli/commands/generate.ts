import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import { generateApi } from "../../core/generate";
import { loadUserConfig } from "../../core/config-loader";
import { scaffoldInfrastructure, hasCustomTemplateConfig } from "../../core/installer";
import { DEFAULT_PRESET } from "../../core/presets";
import { showBanner } from "../ui/banner";

interface GenerateOptions {
  url?: string;
  file?: string;
  output?: string;
  alias?: string;
  config?: string;
  templates?: string;
  dryRun?: boolean;
  msw?: boolean;
  watch?: boolean;
  preset?: string;
}

export async function generateCommand(options: GenerateOptions) {
  showBanner("SpecShot", "API Code Generation");

  let url = options.url;
  let file = options.file;
  let outputDir = options.output;
  let alias = options.alias;

  const config = await loadUserConfig(process.cwd(), options.config);

  const mergedTemplates = options.templates || config.templates;

  if (!url && !file && config.apis && Object.keys(config.apis).length > 0) {
    // Generate all APIs defined in config.apis
    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      console.log(chalk.cyan(`\n--- Generating API: ${apiName} ---`));

      const apiSpecUrl = apiConfig.openapiUrl;

      if (!hasCustomTemplateConfig(mergedTemplates)) {
        const installed = scaffoldInfrastructure({
          preset: options.preset || config.preset || DEFAULT_PRESET,
          apiConfig,
          apiName,
          templateData: config.templateData,
        });
        if (installed) console.log(chalk.green(`✔ Scaffold installed`));
      } else {
        console.log(chalk.gray(`  Skipping scaffold (custom templates configured)`));
      }

      if (!apiSpecUrl) {
        console.warn(
          chalk.yellow(
            `Skipping ${apiName} generation due to missing openapiUrl.`,
          ),
        );
        continue;
      }

      const mergedOptions = {
        ...options,
        url: apiSpecUrl,
      };

      const specSource = apiSpecUrl;
      const tdOutput = (apiConfig.templateData?.outDir as string)
        || (config.templateData?.outDir as string)
        || `src/lib/api/${apiName}/services`;
      const targetDir = path.resolve(process.cwd(), mergedOptions.output || tdOutput);

      try {
        await generateApi(
          specSource,
          targetDir,
          alias || config.alias,
          mergedTemplates,
          {
            configPath: options.config,
            msw: options.msw,
            dryRun: options.dryRun,
            preset: options.preset || config.preset,
            templateData: {
              ...config.templateData,
              ...apiConfig.templateData,
              outDir: (apiConfig.templateData?.outDir as string)
                || (config.templateData?.outDir as string)
                || `src/lib/api/${apiName}/services`,
              coreOut: (apiConfig.templateData?.coreOut as string)
                || (config.templateData?.coreOut as string)
                || `src/lib/api/core`,
            },
          },
        );
        console.log(
          chalk.green(
            `API ${apiName} generated successfully!`,
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

  const firstApiEntry = config.apis && Object.entries(config.apis)[0];
  const firstApi = firstApiEntry?.[1];
  const firstApiName = firstApiEntry?.[0];
  if (!url && !file && firstApi?.openapiUrl) url = firstApi.openapiUrl;
  if (!alias && config.alias) alias = config.alias;

  if (firstApi && !hasCustomTemplateConfig(mergedTemplates)) {
    const installed = scaffoldInfrastructure({
      preset: options.preset || config.preset || DEFAULT_PRESET,
      apiConfig: firstApi,
      apiName: firstApiName || "api",
      templateData: config.templateData,
    });
    if (installed) console.log(chalk.green(`✔ Scaffold installed`));
  }

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

  if (!outputDir) {
    console.error(chalk.red("Output directory is required."));
    return;
  }

  const sourceLabel = file ? file : url!;
  const targetDir = path.resolve(process.cwd(), outputDir!);

  try {
    const runGenerate = async () => {
      try {
        if (options.dryRun) {
          console.log(
            chalk.cyan(
              `\n[DRY RUN] Would generate services from ${sourceLabel} to ${outputDir}`,
            ),
          );
          console.log(
            chalk.gray("  Templates: ") + (mergedTemplates || "built-in"),
          );
          console.log(chalk.gray("  Alias:     ") + (alias || "none"));
          console.log(chalk.gray("  Preset:    ") + (options.preset || config.preset || DEFAULT_PRESET));
          const spec = await generateApi(
            sourceLabel,
            targetDir,
            alias,
            mergedTemplates,
            {
              dryRun: true,
              configPath: options.config,
              msw: options.msw,
              preset: options.preset || config.preset,
            },
          );
          console.log(chalk.gray(`  Endpoints: ${spec}`));
          return;
        }

        await generateApi(sourceLabel, targetDir, alias, mergedTemplates, {
          configPath: options.config,
          msw: options.msw,
          preset: options.preset || config.preset,
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
    console.error(chalk.red("Failed to setup code generation"));
    console.error(err);
  }
}
