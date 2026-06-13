#!/usr/bin/env node
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";
import { generateApi } from "./generate";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));

const program = new Command();

program
  .name("specshot")
  .description("Fire an OpenAPI spec, get strictly-typed TypeScript code — with Zod validation")
  .version(pkg.version);

program
  .command("init")
  .description("Initialize the API core files in your project")
  .action(async () => {
    console.log(chalk.cyan("Welcome to SpecShot!"));
    
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "coreDir",
        message: "Where would you like to install the API Core?",
        default: "src/lib/api/core",
      },
      {
        type: "input",
        name: "providerDir",
        message: "Where would you like to install the Provider skeleton?",
        default: "src/lib/api/default",
      },
      {
        type: "list",
        name: "integration",
        message: "Which data fetching library do you want to use?",
        choices: [
          { name: "SWR (React)", value: "swr" },
          { name: "None (Vanilla TS / Fetch)", value: "none" }
        ],
        default: "swr",
      },
      {
        type: "checkbox",
        name: "plugins",
        message: "Which interceptors do you want to include?",
        choices: [
          { name: "Bearer Auth — JWT token + auto-refresh", value: "bearer", checked: true },
          { name: "Logger — console.log every request/response", value: "logger" },
        ],
      },
      {
        type: "input",
        name: "openapiUrl",
        message: "What is your OpenAPI JSON URL? (Leave blank to skip auto-generation)",
        default: "http://localhost:8080/openapi.json",
      }
    ]);

    const targetCoreDir = path.resolve(process.cwd(), answers.coreDir);
    const targetProviderDir = path.resolve(process.cwd(), answers.providerDir);
    
    const templateCoreDir = path.join(__dirname, "../templates/core");
    const templateProviderDir = path.join(__dirname, "../templates/provider");
    const templateSWRDir = path.join(__dirname, "../templates/integrations/swr");

    const spinner = ora("Installing API files...").start();
    
    try {
      if (!fs.existsSync(targetCoreDir)) fs.mkdirSync(targetCoreDir, { recursive: true });
      if (!fs.existsSync(targetProviderDir)) fs.mkdirSync(targetProviderDir, { recursive: true });

      let coreRelativePath = path.relative(targetProviderDir, targetCoreDir).replace(/\\/g, "/");
      if (!coreRelativePath.startsWith(".")) coreRelativePath = "./" + coreRelativePath;

      const compileAndWrite = (sourceDir: string, targetDir: string, data: any, filter?: (file: string) => boolean) => {
        const walk = (src: string, dest: string) => {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              walk(srcPath, destPath);
            } else if (entry.name.endsWith(".hbs")) {
              if (filter && !filter(srcPath)) continue;
              const templateStr = fs.readFileSync(srcPath, "utf8");
              const template = Handlebars.compile(templateStr);
              const result = template(data);
              fs.writeFileSync(destPath.replace(/\.hbs$/, ".ts"), result);
            }
          }
        };
        walk(sourceDir, targetDir);
      };

      const templateData = { corePath: coreRelativePath };

      // Build plugin filter: file prefix → required plugin key
      const pluginMap: Record<string, string> = {
        "bearer-auth-manager": "bearer",
        "bearer": "bearer",
        "logger": "logger",
      };
      const selectedPlugins: string[] = answers.plugins || [];

      compileAndWrite(templateCoreDir, targetCoreDir, templateData);
      compileAndWrite(templateProviderDir, targetProviderDir, templateData, (file: string) => {
        // In interceptors dir, skip unselected files
        if (file.includes("/interceptors/")) {
          const base = path.basename(file, ".hbs");
          const required = pluginMap[base];
          if (required && !selectedPlugins.includes(required)) return false;
        }
        return true;
      });

      if (answers.integration === "swr") {
        compileAndWrite(templateSWRDir, targetProviderDir, templateData);
      }

      // Save config file
      const config = {
        coreDir: answers.coreDir,
        providerDir: answers.providerDir,
        integration: answers.integration,
        plugins: answers.plugins || [],
        openapiUrl: answers.openapiUrl || "",
      };
      fs.writeFileSync(path.resolve(process.cwd(), "specshot.json"), JSON.stringify(config, null, 2));

      spinner.succeed(chalk.green(`API Core installed at ${answers.coreDir}`));
      console.log(chalk.green(`API Provider skeleton installed at ${answers.providerDir}`));
      
      if (answers.integration === "swr") {
        console.log(chalk.blue(`Note: React SWR Hooks included! Make sure you have 'swr' installed: npm install swr`));
      }

      if (answers.openapiUrl && answers.openapiUrl.trim() !== "") {
        console.log(chalk.cyan(`\nAuto-generating services from ${answers.openapiUrl}...`));
        const outputDir = path.join(targetProviderDir, "services");
        await generateApi(answers.openapiUrl, outputDir);
      } else {
        console.log(chalk.yellow("\nNext steps:"));
        console.log(`Run ${chalk.cyan("npx specshot generate")} to generate your services from OpenAPI!\n`);
      }
    } catch (err) {
      spinner.fail(chalk.red("Failed to install core files"));
      console.error(err);
    }
  });

program
  .command("generate")
  .description("Generate API services from an OpenAPI URL")
  .option("-u, --url <url>", "OpenAPI JSON URL")
  .option("-o, --output <dir>", "Output directory for generated services")
  .option("-a, --alias <alias>", "Import alias prefix (e.g. @/lib/api)")
  .option("-t, --templates <dir>", "Custom templates directory")
  .option("--dry-run", "Show what would be generated without writing files")
  .action(async (options) => {
    let url = options.url;
    let outputDir = options.output;
    let alias = options.alias;

    // Try to read config
    const configPath = path.resolve(process.cwd(), "specshot.json");
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (!url && config.openapiUrl) url = config.openapiUrl;
        if (!outputDir && config.providerDir) outputDir = path.join(config.providerDir, "services");
        if (!alias && config.alias) alias = config.alias;
      } catch (e) {
        // ignore
      }
    }

    if (!url || !outputDir) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "url",
          message: "What is your OpenAPI JSON URL?",
          default: "http://localhost:8080/openapi.json",
          when: !url
        },
        {
          type: "input",
          name: "outputDir",
          message: "Where should the services be generated?",
          default: "src/lib/api/default/services",
          when: !outputDir
        }
      ]);
      url = url || answers.url;
      outputDir = outputDir || answers.outputDir;
    }

    const targetDir = path.resolve(process.cwd(), outputDir);
    const spinner = ora("Generating API services...").start();

    try {
      // Pause spinner because generateApi uses console.log internally
      spinner.stop(); 
      if (options.dryRun) {
        console.log(chalk.cyan(`\n[DRY RUN] Would generate services from ${url} to ${outputDir}`));
        console.log(chalk.gray("  Templates: ") + (options.templates || "built-in"));
        console.log(chalk.gray("  Alias:     ") + (alias || "none"));
        const spec = await fetch(url).then(r => r.json());
        console.log(chalk.gray(`  Endpoints: ${Object.keys(spec.paths || {}).length}`));
        return;
      }

      await generateApi(url, targetDir, alias, options.templates);
      spinner.succeed(chalk.green(`\nAPI services generated successfully at ${outputDir}!`));
    } catch (err) {
      spinner.fail(chalk.red("Failed to generate API services"));
      console.error(err);
    }
  });

export { program };

if (!process.env.VITEST) {
  program.parse(process.argv);
}
