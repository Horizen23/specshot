#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initCommand } from "./commands/init";
import { generateCommand } from "./commands/generate";
import { mockCommand } from "./commands/mock";
import { templatesCommand, templatesListCommand, templatesContextCommand, templatesTypegenCommand } from "./commands/templates";

// Export types for JS/TS config autocomplete
export type { SpecshotUserConfig as SpecshotConfig } from "../core/config-loader";
export type { SpecshotUserConfig, SpecshotTemplateData } from "../core/config-loader";
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
  .option(
    "-u, --url <url>",
    "OpenAPI JSON URL to auto-generate services after init",
  )
  .option("-t, --templates <dir>", "Custom Handlebars templates directory")
  .option("--preset <name>", "Built-in template preset: class, functional, or zod-functional")
  .action(initCommand);

program
  .command("generate")
  .description(
    "Generate API services from OpenAPI specs (Run repeatedly on API updates)",
  )
  .option("-u, --url <url>", "OpenAPI JSON URL")
  .option("-f, --file <path>", "Path to local OpenAPI JSON file")
  .option("-o, --output <dir>", "Output directory for generated services")
  .option("-a, --alias <alias>", "Import alias prefix (e.g. @/lib/api)")
  .option("-c, --config <path>", "Path to specshot.json config file")
  .option("-t, --templates <dir>", "Custom templates directory")
  .option("--preset <name>", "Built-in template preset: class, functional, or zod-functional")
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
  .option("-p, --port <number>", "Port for the mock API server (default: 3457)")
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

const templatesCmd = program
  .command("templates")
  .description("Manage Handlebars templates (eject, list, inspect)");

templatesCmd
  .command("eject")
  .description("Copy built-in templates to a local directory for customization")
  .option("-o, --output <dir>", "Output directory (default: ./templates)")
  .option("--generator-only", "Eject only generator templates")
  .option("--msw-only", "Eject only MSW templates")
  .option("--preset <name>", "Preset to eject: class, functional, or zod-functional")
  .option("--repeatable-only", "Skip one-time scaffold templates")
  .action(async (options) => {
    try {
      await templatesCommand({
        output: options.output,
        generatorOnly: options.generatorOnly,
        mswOnly: options.mswOnly,
        preset: options.preset,
        repeatableOnly: options.repeatableOnly,
      });
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Templates eject failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("list")
  .description("List all templates and their override status")
  .action(async () => {
    try {
      await templatesListCommand();
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Templates list failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("context <name>")
  .description("Show available variables for a template (e.g. service, models, types)")
  .action(async (name: string) => {
    try {
      await templatesContextCommand(name);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Templates context failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("typegen")
  .description("Generate TypeScript type from _template-data.schema.json files")
  .option("--preset <name>", "Preset to generate types for")
  .option("-o, --output <path>", "Write to file instead of stdout")
  .action(async (options) => {
    try {
      await templatesTypegenCommand(options);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Typegen failed"));
      console.error(err);
    }
  });

templatesCmd.action(async () => {
  const chalk = (await import("chalk")).default;
  console.log(chalk.cyan("\n  Templates\n  ---------\n"));
  console.log("  Commands:");
  console.log("    specshot templates eject            Copy built-in templates for editing");
  console.log("    specshot templates eject --preset functional  Eject a specific preset");
  console.log("    specshot templates list             Show all templates + preset status");
  console.log("    specshot templates context <name>   Show variables for a template");
  console.log("    specshot templates typegen          Generate TemplateData TypeScript type\n");
  console.log(chalk.gray("  Presets: class (default), functional, zod-functional\n"));
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
