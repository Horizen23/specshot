#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initCommand } from "./commands/init";
import { generateCommand } from "./commands/generate";
import { mockCommand } from "./commands/mock";
import { templatesCommand } from "./commands/templates";

// Export types for JS/TS config autocomplete
export type { SpecshotUserConfig as SpecshotConfig } from "../core/config-loader";
export type { FakerPlugin, FakerPluginContext } from "../core/config-loader";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pkgPath = path.join(__dirname, "../../package.json");
if (!fs.existsSync(pkgPath)) {
  pkgPath = path.join(__dirname, "../package.json");
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const program = new Command();

program
  .name("specshot")
  .description(
    "Fire an OpenAPI spec, get strictly-typed TypeScript code — with Zod validation",
  )
  .version(pkg.version, "-v, --version", "output the version number");

program
  .command("init")
  .description("Scaffold the API core infrastructure (One-time setup)")
  .option("--core-dir <dir>", "Directory to install the API Core")
  .option(
    "--provider-dir <dir>",
    "Directory to install the API Provider skeleton",
  )
  .option(
    "--integration <type>",
    "Data fetching integration: 'swr', 'react-query', or 'none'",
  )
  .option(
    "-i, --interceptors <list>",
    "Comma-separated list of built-in interceptors to include (e.g. bearer,logger) or 'none'",
  )
  .option(
    "-u, --url <url>",
    "OpenAPI JSON URL to auto-generate services after init",
  )
  .option("-t, --templates <dir>", "Custom Handlebars templates directory")
  .action(initCommand);

program
  .command("generate")
  .description(
    "Generate API services and auto-wire interceptors (Run repeatedly on API updates)",
  )
  .option("-u, --url <url>", "OpenAPI JSON URL")
  .option("-f, --file <path>", "Path to local OpenAPI JSON file")
  .option("-o, --output <dir>", "Output directory for generated services")
  .option("-a, --alias <alias>", "Import alias prefix (e.g. @/lib/api)")
  .option("-c, --config <path>", "Path to specshot.json config file")
  .option("-t, --templates <dir>", "Custom templates directory")
  .option("--template-models <path>", "Override models.hbs template file")
  .option("--template-types <path>", "Override types.hbs template file")
  .option("--template-service <path>", "Override service.hbs template file")
  .option("--template-index <path>", "Override provider index.hbs template file")
  .option("--template-interceptors-index <path>", "Override interceptors-index.hbs template file")
  .option("--template-msw-handlers <path>", "Override MSW handlers.hbs template file")
  .option("--template-msw-index <path>", "Override MSW index.hbs template file")
  .option("--template-msw-browser <path>", "Override MSW browser.hbs template file")
  .option("-i, --interceptors <dir>", "Custom interceptors directory")
  .option("-w, --watch", "Watch for changes and auto-regenerate")
  .option("--dry-run", "Run without writing any files")
  .option("--msw", "Generate MSW mock handlers")
  .action(generateCommand);

program
  .command("mock")
  .description(
    "Interactively select and configure API endpoints to mock with MSW",
  )
  .option("-u, --url <url>", "OpenAPI JSON URL")
  .option("-f, --file <path>", "Path to local OpenAPI JSON file")
  .option("-o, --output <dir>", "Output directory for MSW handlers")
  .option("-c, --config <path>", "Path to specshot.json config file")
  .option("-w, --web", "Launch web-based mock dashboard instead of CLI flow")
  .option("-p, --port <number>", "Port for web dashboard (default: 3456)")
  .option("-x, --proxy <url>", "Proxy unmatched requests to target URL")
  .option("--no-open", "Do not open browser automatically")
  .action(async (options) => {
    try {
      await mockCommand({
        url: options.url,
        file: options.file,
        output: options.output,
        configPath: options.config,
        web: options.web,
        port: options.port ? parseInt(options.port, 10) : undefined,
        proxy: options.proxy,
        noOpen: options.open === false,
      });
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Mock command failed"));
      console.error(err);
    }
  });

program
  .command("templates")
  .description("Eject built-in Handlebars templates for local customization")
  .option("-o, --output <dir>", "Output directory (default: ./templates)")
  .option("--generator-only", "Eject only generator templates")
  .option("--msw-only", "Eject only MSW templates")
  .action(async (options) => {
    try {
      await templatesCommand({
        output: options.output,
        generatorOnly: options.generatorOnly,
        mswOnly: options.mswOnly,
      });
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Templates command failed"));
      console.error(err);
    }
  });

export { program };

if (!process.env.VITEST) {
  if (process.argv.length <= 2) {
    import("./ui/tui").then(({ startTui }) => {
      startTui().catch((err) => {
        console.error(err);
        process.exit(1);
      });
    });
  } else {
    program.parse(process.argv);
  }
}
