import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { DEFAULT_CONFIG_FILE, loadUserConfig } from "../../core/config-loader";
import {
  readAllSchemas,
  generateTypeFile,
  generateJSDocTypeDef,
} from "../../core/template-registry";
import {
  getAvailablePresets,
  getPresetInfo,
  DEFAULT_PRESET,
} from "../../core/presets";

import { showBanner } from "../ui/banner";

interface InitOptions {
  url?: string;
  templates?: string;
  preset?: string;
  yes?: boolean;
  data?: string;
  apiName?: string;
}

export async function initCommand(options: InitOptions = {}) {
  showBanner("SpecShot", "The OpenAPI Code Generator");

  const cwd = process.cwd();
  const config = await loadUserConfig(cwd);

  const hasMultiApi =
    config && config.apis && Object.keys(config.apis).length > 0;

  if (config) {
    const firstApi = config.apis && Object.values(config.apis)[0];
    options.url =
      options.url !== undefined ? options.url : firstApi?.openapiUrl;
    options.templates =
      options.templates !== undefined
        ? options.templates
        : typeof config.templates === "string"
          ? config.templates
          : undefined;
  }

  let finalOpenapiUrl = options.url;

  let apisToGenerate: { name: string; url: string }[] = [];

  if (!hasMultiApi) {
    if (options.yes) {
      apisToGenerate.push({
        name: options.apiName || "api",
        url: finalOpenapiUrl || "http://localhost:8080/openapi.json",
      });
      finalOpenapiUrl = finalOpenapiUrl || "http://localhost:8080/openapi.json";
    } else {
      const globalAnswers = await inquirer.prompt([
        {
          type: "confirm",
          name: "isMultiApi",
          message:
            "Do you want to configure multiple APIs? (e.g. Auth API, Product API)",
          default: false,
          when: options.url === undefined,
        },
      ]);

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
              type: "confirm",
              name: "addMore",
              message: "Do you want to configure another API?",
              default: false,
            },
          ]);

          apisToGenerate.push({
            name: apiAnswers.apiName,
            url: apiAnswers.openapiUrl,
          });
          addMore = apiAnswers.addMore;
          count++;
        }
      } else {
        const singleAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "apiName",
            message: "What is the name of this API? (e.g. 'petstore', 'auth')",
            default: "api",
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

        apisToGenerate.push({
          name: singleAnswers.apiName,
          url:
            finalOpenapiUrl !== undefined
              ? finalOpenapiUrl
              : singleAnswers.openapiUrl || "",
        });

        finalOpenapiUrl =
          finalOpenapiUrl !== undefined
            ? finalOpenapiUrl
            : singleAnswers.openapiUrl;
      }
    }
  }

  // ── Select preset ──
  let selectedPreset = options.preset || config?.preset || DEFAULT_PRESET;
  if (!options.yes && !options.preset) {
    const presetAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "preset",
        message: "Which template preset would you like to use?",
        default: selectedPreset,
        choices: getAvailablePresets().map((p) => ({
          name: `${p.name.padEnd(18)} ${chalk.gray(p.description)}`,
          value: p.name,
        })),
      },
    ]);
    selectedPreset = presetAnswer.preset;
  }

  // Validate preset has required structure
  const errors = (await import("../../core/presets")).validatePresetStructure(
    selectedPreset,
  );
  if (errors.length > 0) {
    console.error(chalk.red(`\n  Preset "${selectedPreset}" has issues:`));
    for (const err of errors) {
      console.error(chalk.red(`    - ${err}`));
    }
    console.log(
      chalk.gray("\n  Choose a different preset or fix the issues above.\n"),
    );
    return;
  }

  const presetInfo = getPresetInfo(selectedPreset);
  const presetDefaults = presetInfo?.templateData || {};

  // ── Prompt templateData from schemas ──
  const schemas = readAllSchemas(selectedPreset);
  const mergedProps: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      items?: { type: string; enum?: string[] };
      default?: unknown;
    }
  > = {};
  for (const schema of schemas) {
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      mergedProps[key] = {
        ...prop,
        default: prop.default ?? mergedProps[key]?.default,
      };
    }
  }

  const templateDataAnswers: Record<string, unknown> = {};
  if (Object.keys(mergedProps).length > 0) {
    if (options.yes) {
      // In non-interactive mode, use defaults and merge with --data
      let providedData: Record<string, unknown> = {};
      if (options.data) {
        try {
          providedData = JSON.parse(options.data);
        } catch (err) {
          console.error(chalk.red("Failed to parse --data as JSON"));
        }
      }
      for (const [key, prop] of Object.entries(mergedProps)) {
        templateDataAnswers[key] =
          providedData[key] !== undefined
            ? providedData[key]
            : presetDefaults[key] !== undefined
              ? presetDefaults[key]
              : prop.default;
      }
    } else {
      console.log(chalk.cyan("\n--- Template Configuration ---"));
      const questions: Record<string, unknown>[] = [];

      for (const [key, prop] of Object.entries(mergedProps)) {
        const defaultValue =
          presetDefaults[key] !== undefined
            ? presetDefaults[key]
            : prop.default;

        if (prop.enum) {
          questions.push({
            type: "list",
            name: key,
            message: prop.description || key,
            default: defaultValue as string,
            choices: prop.enum,
          });
        } else if (prop.type === "array") {
          if (prop.items?.enum) {
            questions.push({
              type: "checkbox",
              name: key,
              message: prop.description || key,
              default: defaultValue as string[],
              choices: prop.items.enum,
            });
          } else {
            questions.push({
              type: "input",
              name: key,
              message: `${prop.description || key} (comma-separated)`,
              default: Array.isArray(defaultValue)
                ? defaultValue.join(", ")
                : "",
              filter: (input: string) =>
                input
                  .split(",")
                  .map((s: string) => s.trim())
                  .filter(Boolean),
            });
          }
        } else if (prop.type === "boolean") {
          questions.push({
            type: "confirm",
            name: key,
            message: prop.description || key,
            default: defaultValue as boolean,
          });
        } else {
          questions.push({
            type: "input",
            name: key,
            message: prop.description || key,
            default: defaultValue as string,
          });
        }
      }

      const answers = await inquirer.prompt(questions);
      Object.assign(templateDataAnswers, answers);
    }
  }

  // ── Write config file ──
  let apisContent = "";
  if (apisToGenerate.length > 0) {
    apisContent = `  apis: {\n`;
    apisToGenerate.forEach((api) => {
      apisContent += `    ${JSON.stringify(api.name)}: {\n`;
      apisContent += `      openapiUrl: ${JSON.stringify(api.url)},\n`;
      apisContent += `    },\n`;
    });
    apisContent += `  },\n`;
  } else if (hasMultiApi && config.apis) {
    apisContent = `  apis: {\n`;
    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      apisContent += `    ${JSON.stringify(apiName)}: {\n`;
      apisContent += `      openapiUrl: ${JSON.stringify(apiConfig.openapiUrl)},\n`;
      apisContent += `    },\n`;
    }
    apisContent += `  },\n`;
  } else {
    apisContent = `  apis: {\n`;
    apisContent += `    default: {\n`;
    apisContent += `      openapiUrl: ${JSON.stringify(finalOpenapiUrl || "")},\n`;
    apisContent += `    }\n`;
    apisContent += `  },\n`;
  }

  const existingTemplateData = (config && config.templateData) || {};
  const mergedTemplateData = {
    ...existingTemplateData,
    ...templateDataAnswers,
  };
  const tdKeys = Object.keys(mergedTemplateData);
  const tdStr =
    tdKeys.length > 0
      ? JSON.stringify(mergedTemplateData, null, 4).replace(/\n/g, "\n  ")
      : "{}";

  // Generate multi-line JSDoc typedef + @type
  const typedefBlock = generateJSDocTypeDef(selectedPreset);
  const jsdocType = generateTypeFile(selectedPreset);

  const configContent = `${typedefBlock}
/** @type {${jsdocType}} */
export default {
  preset: ${JSON.stringify(selectedPreset)},
${options.templates ? `  templates: ${JSON.stringify(options.templates)},\n` : ""}${apisContent}  templateData: ${tdStr},
};
`;

  const configPath = path.resolve(cwd, DEFAULT_CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    if (!options.yes) {
      const { overwrite } = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: `${DEFAULT_CONFIG_FILE} already exists. Overwrite?`,
          default: false,
        },
      ]);
      if (!overwrite) {
        console.log(chalk.gray("  Cancelled.\n"));
        return;
      }
    }
  }

  fs.writeFileSync(configPath, configContent);
  console.log(chalk.green(`\n✔ Config written to ${DEFAULT_CONFIG_FILE}`));

  console.log(chalk.cyan(`\nNext steps:`));
  console.log(
    `  Run ${chalk.cyan("npx specshot generate")} to scaffold and generate your API code.\n`,
  );
}
