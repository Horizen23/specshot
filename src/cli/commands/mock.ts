import { flattenEndpoints, groupByTag } from "../../utils/openapi-utils";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSpec } from "../../core/spec-loader";
import { generateApi } from "../../core/generate";
import { CONFIG_FILE } from "../../types/constants";
import {
  loadMockConfig,
  saveMockConfig,
  endpointKey,
  type MockConfigFile,
  type MockEndpointEntry,
} from "../../types/mock-config";
import { HTTP_OK, JSON_CONTENT_TYPE } from "../../types/constants";
import type { OpenApiSpec, OpenApiOperation } from "../../types/types";
import { startMockWebServer } from "../../core/mock-server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export async function mockCommand(options: {
  url?: string;
  file?: string;
  output?: string;
  configPath?: string;
  web?: boolean;
  port?: number;
  proxy?: string;
}) {
  if (options.web) {
    await startMockWebServer({
      url: options.url,
      file: options.file,
      output: options.output,
      configPath: options.configPath,
      port: options.port,
      proxy: options.proxy,
    });
    return;
  }
  console.log(chalk.cyan("SpecShot — Interactive Mock Configuration\n"));

  // 1. Resolve spec source
  let specSource: string | undefined;
  const cwd = process.cwd();

  // Try config
  const configPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : path.resolve(cwd, CONFIG_FILE);
  let config: Partial<MockConfigFile> & Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }

  specSource = options.file
    ? path.resolve(cwd, options.file)
    : options.url
      ? options.url
      : (config.openapiUrl as string | undefined) || undefined;

  // Load existing mock config to pre-fill selections
  const existingMockConfig = loadMockConfig(cwd);

  if (!specSource) {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "specInput",
        message: "What is your OpenAPI JSON URL or local file path?",
        default:
          existingMockConfig.specSource || "http://localhost:8080/openapi.json",
      },
    ]);
    const input: string = answer.specInput;
    specSource =
      input.startsWith("http://") || input.startsWith("https://")
        ? input
        : path.resolve(cwd, input);
  }

  // 2. Load spec
  const spinner = ora("Loading OpenAPI spec...").start();
  let spec: OpenApiSpec;
  try {
    spec = await loadSpec(specSource);
    spinner.succeed("OpenAPI spec loaded");
  } catch (err) {
    spinner.fail("Failed to load spec");
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }

  // 3. Parse endpoints
  const endpoints = flattenEndpoints(spec);
  if (endpoints.length === 0) {
    console.log(chalk.yellow("No tagged endpoints found in the spec."));
    return;
  }

  const groupedByTag = groupByTag(endpoints);
  const tags = Array.from(groupedByTag.keys());

  // 4. Filter by tag
  const tagChoices = [
    {
      name:
        chalk.bold("All tags") + chalk.gray(` (${endpoints.length} endpoints)`),
      value: "__all__",
    },
    ...tags.map((t) => {
      const count = groupedByTag.get(t)!.length;
      return {
        name: `${t}${chalk.gray(` (${count} endpoint${count > 1 ? "s" : ""})`)}`,
        value: t,
      };
    }),
  ];

  const { selectedTag } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTag",
      message: "Select tag to configure:",
      choices: tagChoices,
      pageSize: 15,
    },
  ]);

  const filteredEndpoints =
    selectedTag === "__all__" ? endpoints : groupedByTag.get(selectedTag) || [];

  // 5. Select endpoints (checkbox)
  const preSelectedKeys = new Set(
    Object.entries(existingMockConfig.endpoints || {})
      .filter(([, v]) => v.enabled)
      .map(([k]) => k),
  );

  const endpointChoices = filteredEndpoints.map((ep) => ({
    name: `${chalk.cyan(ep.tag)} - ${ep.operationId} ${chalk.gray(`(${ep.method} ${ep.path})`)}`,
    value: ep.key,
    checked: preSelectedKeys.has(ep.key),
  }));

  const { selectedEndpoints } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedEndpoints",
      message: `Select endpoints to mock (${filteredEndpoints.length} total):`,
      choices: endpointChoices,
      pageSize: 20,
      validate: (input: string[]) =>
        input.length > 0 || "Select at least one endpoint",
    },
  ]);

  if (selectedEndpoints.length === 0) {
    console.log(chalk.yellow("No endpoints selected. Aborting."));
    return;
  }

  const selectedSet = new Set(selectedEndpoints as string[]);

  // 6. Configure mock behavior
  const { mode } = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Configure mock behavior for selected endpoints?",
      choices: [
        { name: "Use defaults (200 OK, instant response)", value: "defaults" },
        { name: "Customize per endpoint", value: "customize" },
      ],
    },
  ]);

  // Per-endpoint config overrides
  const endpointOverrides: Record<string, Partial<MockEndpointEntry>> = {};

  if (mode === "customize") {
    const selectedEps = endpoints.filter((ep) => selectedSet.has(ep.key));

    for (const ep of selectedEps) {
      const label = `${ep.operationId} ${chalk.gray(`(${ep.method} ${ep.path})`)}`;
      const existing = existingMockConfig.endpoints?.[ep.key];

      const defaultStatusCode =
        ep.method === "POST" ? 201 : ep.method === "DELETE" ? 204 : 200;

      const answers = await inquirer.prompt([
        {
          type: "number",
          name: "statusCode",
          message: `${label} — Status code:`,
          default: existing?.statusCode ?? defaultStatusCode,
          validate: (v: number) =>
            (v >= 100 && v < 600) || "Enter valid HTTP status code (100-599)",
        },
        {
          type: "number",
          name: "delay",
          message: `${label} — Response delay (ms):`,
          default: existing?.delay ?? 0,
          validate: (v: number) =>
            (v >= 0 && v <= 30000) || "Delay must be 0-30000ms",
        },
        {
          type: "input",
          name: "mockData",
          message: `${label} — Custom mock data (leave blank for auto):
  ${chalk.gray('Example: { id: 1, name: "test" }')}`,
          default: existing?.mockData || "",
        },
      ]);

      endpointOverrides[ep.key] = {};
      if (answers.statusCode !== defaultStatusCode) {
        endpointOverrides[ep.key].statusCode = answers.statusCode;
      }
      if (answers.delay > 0) {
        endpointOverrides[ep.key].delay = answers.delay;
      }
      if ((answers.mockData || "").trim()) {
        endpointOverrides[ep.key].mockData = answers.mockData.trim();
      }

      console.log(); // spacing
    }
  }

  // 7. Output directory
  const defaultOutput =
    existingMockConfig.outputDir ||
    path.join((config.providerDir as string) || "src/lib/api/default", "msw", "handlers");

  const { outputDir } = await inquirer.prompt([
    {
      type: "input",
      name: "outputDir",
      message: "Where to generate MSW handlers?",
      default: defaultOutput,
    },
  ]);

  const resolvedOutputDir = path.resolve(cwd, outputDir);

  // 8. Build mock config
  const mockConfig: MockConfigFile = {
    endpoints: {},
    outputDir,
    specSource: options.file || options.url || specSource,
    lastGenerated: new Date().toISOString(),
  };

  for (const ep of endpoints) {
    const overrides = endpointOverrides[ep.key] || {};

    mockConfig.endpoints[ep.key] = {
      enabled: selectedSet.has(ep.key),
      tag: ep.tag,
      operationId: ep.operationId,
      method: ep.method,
      path: ep.path,
      ...overrides,
    };
  }

  // 9. Generate MSW handlers
  const genSpinner = ora("Generating MSW handlers...").start();

  try {
    // Determine providerDir (parent of services dir)
    const providerDirFromOutput = path.dirname(path.dirname(resolvedOutputDir));

    // We need to generate services first (or at minimum the types) because MSW handlers reference them.
    // For the mock command, we generate services into a temp location alongside msw output.
    const servicesDir = path.join(providerDirFromOutput, "services");

    await generateApi(specSource, servicesDir, undefined, undefined, {
      msw: true,
      mswOutputDir: resolvedOutputDir,
      mswEndpointFilter: selectedSet,
      mswEndpointConfigs: mockConfig.endpoints,
    });

    // Save mock config
    saveMockConfig(mockConfig, cwd);

    const enabledCount = selectedSet.size;
    const skippedCount = endpoints.length - enabledCount;

    genSpinner.succeed(chalk.green("MSW handlers generated!"));
    console.log("");
    console.log(
      chalk.green(
        `${enabledCount} handler${enabledCount > 1 ? "s" : ""} generated, ${skippedCount} endpoint${skippedCount > 1 ? "s" : ""} skipped.`,
      ),
    );
    console.log(chalk.gray(`Output: ${resolvedOutputDir}`));
    console.log(
      chalk.gray(`Config saved: ${path.resolve(cwd, "specshot.mocks.json")}`),
    );

    if (mode === "customize") {
      console.log(
        chalk.cyan(
          "\nTip: Run `specshot mock` again to adjust your mock configuration.",
        ),
      );
    }
  } catch (err) {
    genSpinner.fail(chalk.red("Failed to generate MSW handlers"));
    console.error(chalk.red((err as Error).message));
  }
}
