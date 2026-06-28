#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initCommand } from "./commands/init";
import { generateCommand } from "./commands/generate";
import { mockCommand } from "./commands/mock";
import {
  templatesEjectPresetCommand,
  templatesListCommand,
  templatesContextCommand,
  templatesTypegenCommand,
  templatesValidateCommand,
  templatesInstallCommand,
  templatesUninstallCommand,
} from "./commands/templates";

// Export types for JS/TS config autocomplete
export type {
  SpecshotUserConfig as SpecshotConfig,
  SpecshotUserConfig,
  SpecshotTemplateData,
} from "../core/config-loader";
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
  .option(
    "--preset <name>",
    "Preset name (built-in: class, functional; or community/custom)",
  )
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
  .option(
    "--preset <name>",
    "Preset name (built-in: class, functional; or community/custom)",
  )
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
  .command("eject <preset>")
  .description(
    "Copy a built-in or community preset to your project as a custom preset",
  )
  .action(async (preset) => {
    try {
      await templatesEjectPresetCommand(preset);
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
  .description(
    "Show available variables for a template (e.g. service, models, types)",
  )
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
  .command("validate")
  .description(
    "Validate preset structure and _preset.json for community templates",
  )
  .option("--preset <name>", "Preset to validate")
  .action(async (options) => {
    try {
      await templatesValidateCommand(options);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Validation failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("typegen")
  .description(
    "Generate TypeScript type definitions from template data schemas",
  )
  .option("--preset <name>", "Preset to generate types for")
  .option("--output <path>", "Output file path (prints to stdout if omitted)")
  .action(async (options) => {
    try {
      await templatesTypegenCommand(options);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Typegen failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("install <package>")
  .description("Install a community preset from npm or GitHub")
  .option(
    "--name <name>",
    "Override preset name (default: derived from package/repo name)",
  )
  .action(async (packageName: string, options: { name?: string }) => {
    try {
      await templatesInstallCommand(packageName, options.name);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Install failed"));
      console.error(err);
    }
  });

templatesCmd
  .command("uninstall <preset>")
  .description("Remove an installed community preset")
  .action(async (presetName: string) => {
    try {
      await templatesUninstallCommand(presetName);
    } catch (err) {
      const chalk = (await import("chalk")).default;
      console.error(chalk.red("Uninstall failed"));
      console.error(err);
    }
  });

templatesCmd.action(async () => {
  const chalk = (await import("chalk")).default;
  console.log(chalk.cyan("\n  Templates\n  ---------\n"));
  console.log("  Commands:");
  console.log(
    "    specshot templates eject <preset>   Copy built-in/community preset to project as custom",
  );
  console.log(
    "    specshot templates list             Show all templates + preset status",
  );
  console.log(
    "    specshot templates context <name>   Show variables for a template",
  );
  console.log(
    "    specshot templates validate         Validate preset structure",
  );
  console.log(
    "    specshot templates typegen          Generate TypeScript types from template schemas",
  );
  console.log(
    "    specshot templates install <pkg>    Install preset from npm or GitHub",
  );
  console.log(
    "    specshot templates uninstall <name> Remove an installed preset\n",
  );
  console.log(chalk.gray("  Install sources:"));
  console.log(
    chalk.gray(
      "    specshot templates install specshot-preset-xxx           from npm",
    ),
  );
  console.log(
    chalk.gray(
      "    specshot templates install github:user/repo              from GitHub",
    ),
  );
  console.log(
    chalk.gray(
      "    specshot templates install github:user/repo --name foo   override preset name\n",
    ),
  );
  console.log(
    chalk.gray("  Presets: class (default), functional; or custom/community\n"),
  );
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
