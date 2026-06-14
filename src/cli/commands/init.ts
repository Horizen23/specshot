import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";
import { generateApi } from "../../core/generate";
import { CONFIG_FILE } from "../../types/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initCommand() {
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
          { name: "TanStack Query (React Query)", value: "react-query" },
          { name: "None (Vanilla TS / Fetch)", value: "none" },
        ],
        default: "swr",
      },
      {
        type: "checkbox",
        name: "plugins",
        message: "Which interceptors do you want to include?",
        choices: [
          {
            name: "Bearer Auth — JWT token + auto-refresh",
            value: "bearer",
            checked: true,
          },
          {
            name: "Logger — console.log every request/response",
            value: "logger",
          },
        ],
      },
      {
        type: "input",
        name: "openapiUrl",
        message:
          "What is your OpenAPI JSON URL? (Leave blank to skip auto-generation)",
        default: "http://localhost:8080/openapi.json",
      },
    ]);

    const targetCoreDir = path.resolve(process.cwd(), answers.coreDir);
    const targetProviderDir = path.resolve(process.cwd(), answers.providerDir);

    const templateCoreDir = path.join(__dirname, "../../../templates/core");
    const templateProviderDir = path.join(__dirname, "../../../templates/provider");
    const templateSWRDir = path.join(
      __dirname,
      "../../../templates/integrations/swr",
    );
    const templateReactQueryDir = path.join(
      __dirname,
      "../../../templates/integrations/react-query",
    );

    const spinner = ora("Installing API files...").start();

    try {
      if (!fs.existsSync(targetCoreDir))
        fs.mkdirSync(targetCoreDir, { recursive: true });
      if (!fs.existsSync(targetProviderDir))
        fs.mkdirSync(targetProviderDir, { recursive: true });

      let coreRelativePath = path
        .relative(targetProviderDir, targetCoreDir)
        .replace(/\\/g, "/");
      if (!coreRelativePath.startsWith("."))
        coreRelativePath = "./" + coreRelativePath;

      const compileAndWrite = (
        sourceDir: string,
        targetDir: string,
        data: any,
        filter?: (file: string) => boolean,
      ) => {
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
        bearer: "bearer",
        logger: "logger",
      };
      const selectedPlugins: string[] = answers.plugins || [];

      compileAndWrite(templateCoreDir, targetCoreDir, templateData);
      compileAndWrite(
        templateProviderDir,
        targetProviderDir,
        templateData,
        (file: string) => {
          // In interceptors dir, skip unselected files
          if (file.includes("/interceptors/")) {
            const base = path.basename(file, ".hbs");
            const required = pluginMap[base];
            if (required && !selectedPlugins.includes(required)) return false;
          }
          return true;
        },
      );

      if (answers.integration === "swr") {
        compileAndWrite(templateSWRDir, targetProviderDir, templateData);
      }

      if (answers.integration === "react-query") {
        compileAndWrite(templateReactQueryDir, targetProviderDir, templateData);
      }

      // Save config file
      const config = {
        coreDir: answers.coreDir,
        providerDir: answers.providerDir,
        integration: answers.integration,
        plugins: answers.plugins || [],
        openapiUrl: answers.openapiUrl || "",
      };
      fs.writeFileSync(
        path.resolve(process.cwd(), CONFIG_FILE),
        JSON.stringify(config, null, 2),
      );

      spinner.succeed(chalk.green(`API Core installed at ${answers.coreDir}`));
      console.log(
        chalk.green(
          `API Provider skeleton installed at ${answers.providerDir}`,
        ),
      );

      if (answers.integration === "swr") {
        console.log(
          chalk.blue(
            `Note: React SWR Hooks included! Make sure you have 'swr' installed: npm install swr`,
          ),
        );
      }

      if (answers.integration === "react-query") {
        console.log(
          chalk.blue(
            `Note: React Query Hooks included! Make sure you have '@tanstack/react-query' installed: npm install @tanstack/react-query`,
          ),
        );
      }

      if (answers.openapiUrl && answers.openapiUrl.trim() !== "") {
        console.log(
          chalk.cyan(
            `\nAuto-generating services from ${answers.openapiUrl}...`,
          ),
        );
        const outputDir = path.join(targetProviderDir, "services");
        await generateApi(answers.openapiUrl, outputDir);
      } else {
        console.log(chalk.yellow("\nNext steps:"));
        console.log(
          `Run ${chalk.cyan("npx specshot generate")} to generate your services from OpenAPI!\n`,
        );
      }
    } catch (err) {
      spinner.fail(chalk.red("Failed to install core files"));
      console.error(err);
    }
}
