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
  
  const hasMultiApi = config && config.apis && Object.keys(config.apis).length > 0;

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

  let finalCoreDir = options.coreDir;
  let finalIntegration = options.integration;
  let finalProviderDir = options.providerDir;
  let finalOpenapiUrl = options.url;
  let selectedInterceptors: string[] = [];

  // Prompt logic
  if (!hasMultiApi) {
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

    finalCoreDir = finalCoreDir || answers.coreDir;
    finalProviderDir = finalProviderDir || answers.providerDir;
    finalIntegration = finalIntegration || answers.integration;
    finalOpenapiUrl = finalOpenapiUrl !== undefined ? finalOpenapiUrl : answers.openapiUrl;
    
    if (options.interceptors) {
      if (options.interceptors.toLowerCase() === "none") {
        selectedInterceptors = [];
      } else {
        selectedInterceptors = options.interceptors.split(",").map((s) => s.trim());
      }
    } else {
      selectedInterceptors = answers.interceptors || [];
    }
  } else {
    // Has Multi API, just fill missing globals without prompting
    finalCoreDir = finalCoreDir || "src/lib/api/core";
    finalIntegration = finalIntegration || "swr";
    if (options.interceptors) {
      selectedInterceptors = options.interceptors.toLowerCase() === "none" ? [] : options.interceptors.split(",").map(s => s.trim());
    } else if (config.interceptors) {
      selectedInterceptors = config.interceptors;
    }
  }

  const targetCoreDir = path.resolve(process.cwd(), finalCoreDir!);

  let templatesBaseDir = path.join(__dirname, "../../../templates");
  if (!fs.existsSync(templatesBaseDir) || !fs.existsSync(path.join(templatesBaseDir, "core"))) {
    templatesBaseDir = path.join(__dirname, "../templates");
  }

  const templateCoreDir = path.join(templatesBaseDir, "core");
  const templateProviderDir = path.join(templatesBaseDir, "provider");
  const templateSWRDir = path.join(templatesBaseDir, "integrations/swr");
  const templateReactQueryDir = path.join(templatesBaseDir, "integrations/react-query");

  const spinner = ora("Installing API files...").start();

  try {
    if (!fs.existsSync(targetCoreDir)) fs.mkdirSync(targetCoreDir, { recursive: true });

    const compileAndWrite = (sourceDir: string, targetDir: string, data: Record<string, unknown>, filter?: (file: string) => boolean) => {
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

    // Install Core Files
    let coreRelativePathForCore = "."; // Core templates don't usually reference themselves
    compileAndWrite(templateCoreDir, targetCoreDir, { corePath: coreRelativePathForCore, serverUrl: "" });
    spinner.succeed(chalk.green(`API Core installed at ${finalCoreDir}`));

    const setupProvider = async (providerDir: string, openapiUrl: string | undefined, interceptors: string[], apiName?: string) => {
      const targetProviderDir = path.resolve(process.cwd(), providerDir);
      if (!fs.existsSync(targetProviderDir)) fs.mkdirSync(targetProviderDir, { recursive: true });

      let coreRelativePath = path.relative(targetProviderDir, targetCoreDir).replace(/\\/g, "/");
      if (!coreRelativePath.startsWith(".")) coreRelativePath = "./" + coreRelativePath;

      let serverUrl = "";
      if (openapiUrl) {
        try {
          const parsedUrl = new URL(openapiUrl);
          serverUrl = parsedUrl.origin;
        } catch {}
      }

      const templateData = { corePath: coreRelativePath, serverUrl };

      const interceptorMap: Record<string, string> = {
        "bearer-auth-manager": "bearer",
        bearer: "bearer",
        logger: "logger",
      };

      compileAndWrite(templateProviderDir, targetProviderDir, templateData, (file: string) => {
        if (file.includes("/interceptors/")) {
          const base = path.basename(file, ".hbs");
          const required = interceptorMap[base];
          if (required && !interceptors.includes(required)) return false;
        }
        return true;
      });

      if (finalIntegration === "swr") compileAndWrite(templateSWRDir, targetProviderDir, templateData);
      if (finalIntegration === "react-query") compileAndWrite(templateReactQueryDir, targetProviderDir, templateData);

      if (finalIntegration === "swr" || finalIntegration === "react-query") {
        const sharedHbs = path.join(templatesBaseDir, "integrations", "hooks-shared.hbs");
        if (fs.existsSync(sharedHbs)) {
          const templateStr = fs.readFileSync(sharedHbs, "utf8");
          const compiled = Handlebars.compile(templateStr);
          fs.writeFileSync(path.join(targetProviderDir, "hooks-shared.ts"), compiled(templateData));
        }
      }

      console.log(chalk.green(`API Provider skeleton${apiName ? ` (${apiName})` : ""} installed at ${providerDir}`));

      if (openapiUrl && openapiUrl.trim() !== "") {
        console.log(chalk.cyan(`\nAuto-generating services from ${openapiUrl}...`));
        const outputDir = path.join(targetProviderDir, "services");
        await generateApi(openapiUrl, outputDir);
      }
    };

    if (!config || Object.keys(config).length === 0) {
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
      fs.writeFileSync(path.resolve(process.cwd(), DEFAULT_CONFIG_FILE), configContent);
    }

    if (hasMultiApi && config.apis) {
      for (const [apiName, apiConfig] of Object.entries(config.apis)) {
        const apiProviderDir = apiConfig.providerDir || config.providerDir;
        const apiOpenapiUrl = apiConfig.openapiUrl || config.openapiUrl;
        const apiInterceptors = apiConfig.interceptors || selectedInterceptors;
        
        if (apiProviderDir) {
          await setupProvider(apiProviderDir, apiOpenapiUrl, apiInterceptors, apiName);
        }
      }
    } else {
      await setupProvider(finalProviderDir!, finalOpenapiUrl, selectedInterceptors);
    }

    if (finalIntegration === "swr") {
      console.log(chalk.blue(`Note: React SWR Hooks included! Make sure you have 'swr' installed: npm install swr`));
    } else if (finalIntegration === "react-query") {
      console.log(chalk.blue(`Note: React Query Hooks included! Make sure you have '@tanstack/react-query' installed: npm install @tanstack/react-query`));
    }

    if (!hasMultiApi && (!finalOpenapiUrl || finalOpenapiUrl.trim() === "")) {
      console.log(chalk.yellow("\nNext steps:"));
      console.log(`Run ${chalk.cyan("npx specshot generate")} to generate your services from OpenAPI!\n`);
    }

  } catch (err) {
    spinner.fail(chalk.red("Failed to install core files"));
    console.error(err);
  }
}
