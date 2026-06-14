import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { generateApi } from "../../core/generate";
import { CONFIG_FILE } from "../../types/constants";

export async function generateCommand(options: any) {
    let url = options.url;
    let file = options.file;
    let outputDir = options.output;
    let alias = options.alias;

    // Resolve config path
    const configPath = options.config
      ? path.resolve(process.cwd(), options.config)
      : path.resolve(process.cwd(), CONFIG_FILE);

    // Try to read config
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (!url && !file && config.openapiUrl) url = config.openapiUrl;
        if (!outputDir && config.providerDir)
          outputDir = path.join(config.providerDir, "services");
        if (!alias && config.alias) alias = config.alias;
      } catch (e) {
        // ignore
      }
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
    const targetDir = path.resolve(process.cwd(), outputDir);
    const spinner = ora("Generating API services...").start();

    try {
      // Pause spinner because generateApi uses console.log internally
      spinner.stop();
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
          { dryRun: true, configPath, msw: options.msw },
        );
        console.log(chalk.gray(`  Endpoints: ${spec}`));
        return;
      }

      await generateApi(sourceLabel, targetDir, alias, options.templates, {
        configPath,
        msw: options.msw,
      });
      spinner.succeed(
        chalk.green(`\nAPI services generated successfully at ${outputDir}!`),
      );
    } catch (err) {
      spinner.fail(chalk.red("Failed to generate API services"));
      console.error(err);
    }
}
