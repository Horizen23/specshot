import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { DEFAULT_CONFIG_FILE, loadUserConfig } from "../../core/config-loader";

import { showBanner } from "../ui/banner";

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
      options.templates !== undefined
        ? options.templates
        : typeof config.templates === "string"
          ? config.templates
          : undefined;
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

  let apisToGenerate: { name: string; url: string; providerDir: string }[] = [];

  if (!hasMultiApi) {
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

  // ── Write config file only ──
  let apisContent = "";
  if (apisToGenerate.length > 0) {
    apisContent = `  apis: {\n`;
    apisToGenerate.forEach((api) => {
      apisContent += `    ${JSON.stringify(api.name)}: {\n`;
      apisContent += `      providerDir: ${JSON.stringify(api.providerDir)},\n`;
      apisContent += `      openapiUrl: ${JSON.stringify(api.url)},\n`;
      apisContent += `    },\n`;
    });
    apisContent += `  },\n`;
  } else if (hasMultiApi && config.apis) {
    apisContent = `  apis: {\n`;
    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      apisContent += `    ${JSON.stringify(apiName)}: {\n`;
      apisContent += `      providerDir: ${JSON.stringify(apiConfig.providerDir)},\n`;
      apisContent += `      openapiUrl: ${JSON.stringify(apiConfig.openapiUrl)},\n`;
      apisContent += `    },\n`;
    }
    apisContent += `  },\n`;
  } else {
    apisContent = `  apis: {\n`;
    apisContent += `    default: {\n`;
    apisContent += `      providerDir: ${JSON.stringify(finalProviderDir)},\n`;
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

  console.log(chalk.green(`\n✔ Config written to ${DEFAULT_CONFIG_FILE}`));
  console.log(chalk.cyan(`\nNext steps:`));
  console.log(
    `  Run ${chalk.cyan("npx specshot generate")} to generate your API code.\n`,
  );
}
