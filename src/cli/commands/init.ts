import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";
import { generateApi } from "../../core/generate";
import { DEFAULT_CONFIG_FILE, loadUserConfig } from "../../core/config-loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  coreDir?: string;
  providerDir?: string;
  integration?: string;
  interceptors?: string;
  url?: string;
  templates?: string;
}

export async function initCommand(options: InitOptions = {}) {
  console.log(chalk.cyan("Welcome to SpecShot!"));

  const cwd = process.cwd();
  const config = await loadUserConfig(cwd);
  if (config) {
    options.coreDir = options.coreDir !== undefined ? options.coreDir : config.coreDir;
    options.providerDir = options.providerDir !== undefined ? options.providerDir : config.providerDir;
    options.integration = options.integration !== undefined ? options.integration : config.integration;
    options.url = options.url !== undefined ? options.url : config.openapiUrl;
    options.templates = options.templates !== undefined ? options.templates : config.templates;
    if (config.interceptors && config.interceptors.length > 0 && options.interceptors === undefined) {
      options.interceptors = config.interceptors.join(",");
    }
  }

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "coreDir",
      message: "Where would you like to install the API Core?",
      default: options.coreDir || "src/lib/api/core",
      when: options.coreDir === undefined,
    },
    {
      type: "input",
      name: "providerDir",
      message: "Where would you like to install the Provider skeleton?",
      default: options.providerDir || "src/lib/api/default",
      when: options.providerDir === undefined,
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
      default: options.integration || "swr",
      when: options.integration === undefined,
    },
    {
      type: "checkbox",
      name: "interceptors",
      message: "Which interceptors do you want to include?",
      when: options.interceptors === undefined,
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
      default: options.url || "http://localhost:8080/openapi.json",
      when: options.url === undefined,
    },
  ]);

  const finalCoreDir = options.coreDir || answers.coreDir;
  const finalProviderDir = options.providerDir || answers.providerDir;
  const finalIntegration = options.integration || answers.integration;
  const finalOpenapiUrl =
    options.url !== undefined ? options.url : answers.openapiUrl;

  const targetCoreDir = path.resolve(process.cwd(), finalCoreDir);
  const targetProviderDir = path.resolve(process.cwd(), finalProviderDir);

  let templatesBaseDir = path.join(__dirname, "../../../templates");
  if (
    !fs.existsSync(templatesBaseDir) ||
    !fs.existsSync(path.join(templatesBaseDir, "core"))
  ) {
    templatesBaseDir = path.join(__dirname, "../templates");
  }

  const templateCoreDir = path.join(templatesBaseDir, "core");
  const templateProviderDir = path.join(templatesBaseDir, "provider");
  const templateSWRDir = path.join(templatesBaseDir, "integrations/swr");
  const templateReactQueryDir = path.join(
    templatesBaseDir,
    "integrations/react-query",
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
      data: Record<string, unknown>,
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

    // Derive a default server URL for client.hbs from the OpenAPI URL origin.
    // e.g. "http://localhost:8080/openapi.json" → "http://localhost:8080"
    let serverUrl = "";
    if (finalOpenapiUrl) {
      try {
        const parsedUrl = new URL(finalOpenapiUrl);
        serverUrl = parsedUrl.origin;
      } catch {
        // Not a valid URL (e.g. a local file path) — leave empty.
      }
    }

    const templateData = { corePath: coreRelativePath, serverUrl };

    // Build interceptor filter: file prefix → required interceptor key
    const interceptorMap: Record<string, string> = {
      "bearer-auth-manager": "bearer",
      bearer: "bearer",
      logger: "logger",
    };
    let selectedInterceptors: string[] = answers.interceptors || [];
    if (options.interceptors) {
      if (options.interceptors.toLowerCase() === "none") {
        selectedInterceptors = [];
      } else {
        selectedInterceptors = options.interceptors
          .split(",")
          .map((s: string) => s.trim());
      }
    }

    compileAndWrite(templateCoreDir, targetCoreDir, templateData);
    compileAndWrite(
      templateProviderDir,
      targetProviderDir,
      templateData,
      (file: string) => {
        // In interceptors dir, skip unselected files
        if (file.includes("/interceptors/")) {
          const base = path.basename(file, ".hbs");
          const required = interceptorMap[base];
          if (required && !selectedInterceptors.includes(required))
            return false;
        }
        return true;
      },
    );

    if (finalIntegration === "swr") {
      compileAndWrite(templateSWRDir, targetProviderDir, templateData);
    }

    if (finalIntegration === "react-query") {
      compileAndWrite(templateReactQueryDir, targetProviderDir, templateData);
    }

    // Always compile the shared hooks utility when an integration is selected.
    if (finalIntegration === "swr" || finalIntegration === "react-query") {
      const templateIntegrationsDir = path.join(templatesBaseDir, "integrations");
      const sharedHbs = path.join(templateIntegrationsDir, "hooks-shared.hbs");
      if (fs.existsSync(sharedHbs)) {
        const templateStr = fs.readFileSync(sharedHbs, "utf8");
        const compiled = Handlebars.compile(templateStr);
        fs.writeFileSync(
          path.join(targetProviderDir, "hooks-shared.ts"),
          compiled(templateData),
        );
      }
    }

    // Save config file
    const configContent = `/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: ${JSON.stringify(finalCoreDir)},
  providerDir: ${JSON.stringify(finalProviderDir)},
  integration: ${JSON.stringify(finalIntegration)},
  interceptors: ${JSON.stringify(selectedInterceptors)},
${options.templates ? `  templates: ${JSON.stringify(options.templates)},\n` : ""}  openapiUrl: ${JSON.stringify(finalOpenapiUrl || "")},
  
  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   match: (ctx) => ctx.path === "root.phone",
    //   generate: (faker) => faker.phone.number()
    // }
  ]
};
`;
    fs.writeFileSync(
      path.resolve(process.cwd(), DEFAULT_CONFIG_FILE),
      configContent,
    );

    spinner.succeed(chalk.green(`API Core installed at ${finalCoreDir}`));
    console.log(
      chalk.green(`API Provider skeleton installed at ${finalProviderDir}`),
    );

    if (finalIntegration === "swr") {
      console.log(
        chalk.blue(
          `Note: React SWR Hooks included! Make sure you have 'swr' installed: npm install swr`,
        ),
      );
    }

    if (finalIntegration === "react-query") {
      console.log(
        chalk.blue(
          `Note: React Query Hooks included! Make sure you have '@tanstack/react-query' installed: npm install @tanstack/react-query`,
        ),
      );
    }

    if (finalOpenapiUrl && finalOpenapiUrl.trim() !== "") {
      console.log(
        chalk.cyan(`\nAuto-generating services from ${finalOpenapiUrl}...`),
      );
      const outputDir = path.join(targetProviderDir, "services");
      await generateApi(finalOpenapiUrl, outputDir);
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
