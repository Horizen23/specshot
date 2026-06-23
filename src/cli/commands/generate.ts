import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { generateApi } from "../../core/generate";
import { loadUserConfig } from "../../core/config-loader";
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
  interceptors?: string;
  watch?: boolean;
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
        : "";
        
      if (!apiSpecUrl || !apiOutputDir) {
        console.warn(chalk.yellow(`Skipping ${apiName} due to missing openapiUrl or providerDir.`));
        continue;
      }

      const mergedOptions = { ...options, url: apiSpecUrl, output: apiOutputDir };
      // Note: In watch mode, we probably shouldn't loop easily without complex logic, 
      // but for now we'll handle standard generation.
      
      const specSource = apiSpecUrl;
      const targetDir = path.resolve(process.cwd(), apiOutputDir);
      
      try {
        await generateApi(specSource, targetDir, alias || config.alias, options.templates || config.templates, {
          configPath: options.config,
          msw: options.msw,
          interceptorsDir: apiConfig.interceptors ? path.join(apiConfig.providerDir || "", "interceptors") : options.interceptors,
        });
        console.log(chalk.green(`API ${apiName} generated successfully at ${apiOutputDir}!`));
      } catch (err) {
        console.error(chalk.red(`Failed to generate API ${apiName}`));
        console.error(err);
      }
    }
    
    if (options.watch) {
      console.warn(chalk.yellow("\nWarning: Watch mode is not fully supported for multi-API generation yet."));
    }
    return;
  }

  const firstApi = config.apis && Object.values(config.apis)[0];
  if (!url && !file && firstApi?.openapiUrl) url = firstApi.openapiUrl;
  if (!outputDir && firstApi?.providerDir)
    outputDir = path.join(firstApi.providerDir, "services");
  if (!alias && config.alias) alias = config.alias;
  if (!options.templates && config.templates)
    options.templates = config.templates;

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
            chalk.gray("  Templates: ") + (options.templates || "built-in"),
          );
          console.log(chalk.gray("  Alias:     ") + (alias || "none"));
          const spec = await generateApi(
            sourceLabel,
            targetDir,
            alias,
            options.templates,
            {
              dryRun: true,
              configPath: options.config,
              msw: options.msw,
              interceptorsDir: options.interceptors,
            },
          );
          console.log(chalk.gray(`  Endpoints: ${spec}`));
          return;
        }

        await generateApi(sourceLabel, targetDir, alias, options.templates, {
          configPath: options.config,
          msw: options.msw,
          interceptorsDir: options.interceptors,
        });
        
        console.log(
          chalk.green(`\nAPI services generated successfully at ${outputDir}!`),
        );
        
        if (options.watch) {
          console.log(chalk.cyan(`\nWatching for changes in ${sourceLabel}...`));
        }
      } catch (err) {
        console.error(chalk.red("Failed to generate API services"));
        console.error(err);
      }
    };

    await runGenerate();

    if (options.watch) {
      if (sourceLabel.startsWith("http://") || sourceLabel.startsWith("https://")) {
        console.warn(chalk.yellow("\nWarning: Watch mode is currently only supported for local files, not URLs. Polling is not implemented."));
      } else {
        let timeout: NodeJS.Timeout | null = null;
        fs.watch(sourceLabel, (eventType) => {
          if (eventType === "change") {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(async () => {
              console.log(chalk.yellow(`\nFile ${sourceLabel} changed. Regenerating...`));
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
