import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";
import { generateApi } from "../../core/generate";
import { DEFAULT_CONFIG_FILE, loadUserConfig } from "../../core/config-loader";

import { showBanner } from "../ui/banner";

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
  showBanner("SpecShot", "The OpenAPI Code Generator");

  const cwd = process.cwd();
  const config = await loadUserConfig(cwd);

  const hasMultiApi =
    config && config.apis && Object.keys(config.apis).length > 0;

  if (config) {
    const firstApi = config.apis && Object.values(config.apis)[0];
    options.coreDir =
      options.coreDir !== undefined ? options.coreDir : config.coreDir;
    options.providerDir =
      options.providerDir !== undefined
        ? options.providerDir
        : firstApi?.providerDir;
    options.integration =
      options.integration !== undefined
        ? options.integration
        : config.integration;
    options.url =
      options.url !== undefined ? options.url : firstApi?.openapiUrl;
    options.templates =
      options.templates !== undefined ? options.templates : config.templates;
    if (
      config.interceptors &&
      config.interceptors.length > 0 &&
      options.interceptors === undefined
    ) {
      options.interceptors = config.interceptors.join(",");
    }
  }

  let finalCoreDir = options.coreDir;
  let finalIntegration = options.integration;
  let finalProviderDir = options.providerDir;
  let finalOpenapiUrl = options.url;
  let selectedInterceptors: string[] = [];

  // Prompt logic
  let apisToGenerate: { name: string; url: string; providerDir: string }[] = [];

  if (!hasMultiApi) {
    // 1. Ask for Global configs
    const globalAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "coreDir",
        message: "Where would you like to install the API Core?",
        default: options.coreDir || "src/lib/api/core",
        when: options.coreDir === undefined,
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
        type: "confirm",
        name: "isMultiApi",
        message:
          "Do you want to configure multiple APIs? (e.g. Auth API, Product API)",
        default: false,
        when: options.url === undefined && options.providerDir === undefined,
      },
    ]);

    finalCoreDir = finalCoreDir || globalAnswers.coreDir;
    finalIntegration = finalIntegration || globalAnswers.integration;

    if (options.interceptors) {
      if (options.interceptors.toLowerCase() === "none") {
        selectedInterceptors = [];
      } else {
        selectedInterceptors = options.interceptors
          .split(",")
          .map((s) => s.trim());
      }
    } else {
      selectedInterceptors = globalAnswers.interceptors || [];
    }

    if (globalAnswers.isMultiApi) {
      let addMore = true;
      let count = 1;
      while (addMore) {
        console.log(chalk.cyan(`\n--- Configure API #${count} ---`));
        const apiAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "apiName",
            message: "What is the name of this API? (e.g. 'auth', 'payment')",
            validate: (input) => (input ? true : "Name is required"),
          },
          {
            type: "input",
            name: "openapiUrl",
            message: "What is the OpenAPI JSON URL?",
          },
          {
            type: "input",
            name: "providerDir",
            message: "Where would you like to install this Provider skeleton?",
            default: (ans: any) => `src/lib/api/${ans.apiName}`,
          },
          {
            type: "confirm",
            name: "addMore",
            message: "Do you want to configure another API?",
            default: false,
          },
        ]);

        apisToGenerate.push({
          name: apiAnswers.apiName,
          url: apiAnswers.openapiUrl,
          providerDir: apiAnswers.providerDir,
        });
        addMore = apiAnswers.addMore;
        count++;
      }
    } else {
      // Single API path
      const singleAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "providerDir",
          message: "Where would you like to install the Provider skeleton?",
          default: options.providerDir || "src/lib/api/default",
          when: options.providerDir === undefined,
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

      finalProviderDir = finalProviderDir || singleAnswers.providerDir;
      finalOpenapiUrl =
        finalOpenapiUrl !== undefined
          ? finalOpenapiUrl
          : singleAnswers.openapiUrl;
    }
  } else {
    // Has Multi API, just fill missing globals without prompting
    finalCoreDir = finalCoreDir || "src/lib/api/core";
    finalIntegration = finalIntegration || "swr";
    if (options.interceptors) {
      selectedInterceptors =
        options.interceptors.toLowerCase() === "none"
          ? []
          : options.interceptors.split(",").map((s) => s.trim());
    } else if (config.interceptors) {
      selectedInterceptors = config.interceptors;
    }
  }

  const targetCoreDir = path.resolve(process.cwd(), finalCoreDir!);

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

    // Install Core Files
    let coreRelativePathForCore = "."; // Core templates don't usually reference themselves
    compileAndWrite(templateCoreDir, targetCoreDir, {
      corePath: coreRelativePathForCore,
      serverUrl: "",
    });
    spinner.succeed(chalk.green(`API Core installed at ${finalCoreDir}`));

    const setupProvider = async (
      providerDir: string,
      openapiUrl: string | undefined,
      interceptors: string[],
      apiName?: string,
    ) => {
      const targetProviderDir = path.resolve(process.cwd(), providerDir);
      if (!fs.existsSync(targetProviderDir))
        fs.mkdirSync(targetProviderDir, { recursive: true });

      let coreRelativePath = path
        .relative(targetProviderDir, targetCoreDir)
        .replace(/\\/g, "/");
      if (!coreRelativePath.startsWith("."))
        coreRelativePath = "./" + coreRelativePath;

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

      compileAndWrite(
        templateProviderDir,
        targetProviderDir,
        templateData,
        (file: string) => {
          if (file.includes("/interceptors/")) {
            const base = path.basename(file, ".hbs");
            const required = interceptorMap[base];
            if (required && !interceptors.includes(required)) return false;
          }
          return true;
        },
      );

      if (finalIntegration === "swr")
        compileAndWrite(templateSWRDir, targetProviderDir, templateData);
      if (finalIntegration === "react-query")
        compileAndWrite(templateReactQueryDir, targetProviderDir, templateData);

      if (finalIntegration === "swr" || finalIntegration === "react-query") {
        const sharedHbs = path.join(
          templatesBaseDir,
          "integrations",
          "hooks-shared.hbs",
        );
        if (fs.existsSync(sharedHbs)) {
          const templateStr = fs.readFileSync(sharedHbs, "utf8");
          const compiled = Handlebars.compile(templateStr);
          fs.writeFileSync(
            path.join(targetProviderDir, "hooks-shared.ts"),
            compiled(templateData),
          );
        }
      }

      console.log(
        chalk.green(
          `API Provider skeleton${apiName ? ` (${apiName})` : ""} installed at ${providerDir}`,
        ),
      );

      if (openapiUrl && openapiUrl.trim() !== "") {
        console.log(
          chalk.cyan(`\nAuto-generating services from ${openapiUrl}...`),
        );
        const outputDir = path.join(targetProviderDir, "services");
        try {
          await generateApi(openapiUrl, outputDir);
        } catch (err) {
          console.error(chalk.red("\nFailed to generate services:"), err);
        }
      }
    };

    if (!config || Object.keys(config).length === 0) {
      let apisContent = "";
      if (apisToGenerate.length > 0) {
        apisContent = `  apis: {\n`;
        apisToGenerate.forEach((api) => {
          apisContent += `    ${JSON.stringify(api.name)}: {\n`;
          apisContent += `      providerDir: ${JSON.stringify(api.providerDir)},\n`;
          apisContent += `      // \`openapiUrl\` รองรับ 2 รูปแบบ:\n`;
          apisContent += `      // 1. URL ของ Backend (เช่น "http://localhost:3000/openapi.json") เพื่อให้ระบบดูด Spec มา Gen โค้ดได้\n`;
          apisContent += `      // 2. ไฟล์ในเครื่อง (เช่น "./openapi.json") หากโหลด Spec เก็บไว้ในโปรเจกต์\n`;
          apisContent += `      openapiUrl: ${JSON.stringify(api.url)},\n`;
          apisContent += `    },\n`;
        });
        apisContent += `  },\n`;
      } else {
        apisContent = `  apis: {\n`;
        apisContent += `    default: {\n`;
        apisContent += `      providerDir: ${JSON.stringify(finalProviderDir)},\n`;
        apisContent += `      // \`openapiUrl\` รองรับ 2 รูปแบบ:\n`;
        apisContent += `      // 1. URL ของ Backend (เช่น "http://localhost:3000/openapi.json") เพื่อให้ระบบดูด Spec มา Gen โค้ดได้\n`;
        apisContent += `      // 2. ไฟล์ในเครื่อง (เช่น "./openapi.json") หากโหลด Spec เก็บไว้ในโปรเจกต์\n`;
        apisContent += `      openapiUrl: ${JSON.stringify(finalOpenapiUrl || "")},\n`;
        apisContent += `    }\n`;
        apisContent += `  },\n`;
      }

      const configContent = `/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: ${JSON.stringify(finalCoreDir)},
  integration: ${JSON.stringify(finalIntegration)},
  interceptors: ${JSON.stringify(selectedInterceptors)},
${options.templates ? `  templates: ${JSON.stringify(options.templates)},\n` : ""}${apisContent}
  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   resolveFaker(context) {
    //     // Custom logic to return a mock value
    //   }
    // }
  ],
};
`;
      fs.writeFileSync(
        path.resolve(process.cwd(), DEFAULT_CONFIG_FILE),
        configContent,
      );
    }

    if (apisToGenerate.length > 0) {
      for (const api of apisToGenerate) {
        await setupProvider(
          api.providerDir,
          api.url,
          selectedInterceptors,
          api.name,
        );
      }
    } else if (hasMultiApi && config.apis) {
      for (const [apiName, apiConfig] of Object.entries(config.apis)) {
        const apiProviderDir = apiConfig.providerDir;
        const apiOpenapiUrl = apiConfig.openapiUrl;
        const apiInterceptors = apiConfig.interceptors || selectedInterceptors;

        if (apiProviderDir) {
          await setupProvider(
            apiProviderDir,
            apiOpenapiUrl,
            apiInterceptors,
            apiName,
          );
        }
      }
    } else {
      await setupProvider(
        finalProviderDir!,
        finalOpenapiUrl,
        selectedInterceptors,
      );
    }

    if (finalIntegration === "swr") {
      console.log(
        chalk.blue(
          `Note: React SWR Hooks included! Make sure you have 'swr' installed: npm install swr`,
        ),
      );
    } else if (finalIntegration === "react-query") {
      console.log(
        chalk.blue(
          `Note: React Query Hooks included! Make sure you have '@tanstack/react-query' installed: npm install @tanstack/react-query`,
        ),
      );
    }

    if (!hasMultiApi && (!finalOpenapiUrl || finalOpenapiUrl.trim() === "")) {
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
