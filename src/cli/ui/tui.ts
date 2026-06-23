import inquirer from "inquirer";
import chalk from "chalk";
import { initCommand } from "../commands/init";
import { generateCommand } from "../commands/generate";
import { mockCommand } from "../commands/mock";
import { showBanner } from "./banner";
import fs from "fs";
import path from "path";

function isInitialized(): boolean {
  return fs.existsSync(path.resolve(process.cwd(), "specshot.config.mjs")) || 
         fs.existsSync(path.resolve(process.cwd(), "specshot.json"));
}

export async function startTui() {
  showBanner("SpecShot", "The Ultimate API CodeGen");
  console.log(chalk.gray(" Welcome to SpecShot Interactive CLI\n"));

  const initialized = isInitialized();

  const choices = [];

  if (!initialized) {
    choices.push({
      name: `🚀 ${chalk.bold("Initialize Project")} (Scaffold core infrastructure)`,
      value: "init",
    });
  } else {
    choices.push({
      name: `🔄 ${chalk.bold("Generate API")} (Update types and services from schema)`,
      value: "generate",
    });
    choices.push({
      name: `🌐 ${chalk.bold("Start Mock Dashboard")} (Interactive Web UI for Mocking)`,
      value: "mock-web",
    });
    choices.push({
      name: `🚀 ${chalk.bold("Re-Initialize Project")} (Scaffold core infrastructure)`,
      value: "init",
    });
  }

  choices.push(new inquirer.Separator());
  choices.push({ name: `❌ ${chalk.red("Exit")}`, value: "exit" });

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices,
      pageSize: 10,
    },
  ]);

  console.log(); // Spacing

  switch (action) {
    case "init":
      await initCommand({});
      break;
    case "generate":
      await generateCommand({});
      break;
    case "mock-web":
      await mockCommand({ web: true });
      break;
    case "exit":
      console.log(chalk.gray("Goodbye! 👋"));
      process.exit(0);
  }
}
