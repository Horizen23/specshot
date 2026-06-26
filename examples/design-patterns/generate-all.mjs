// generate-all.mjs — generates all 4 design patterns into separate directories
import { execSync } from "child_process";
import fs from "fs";

const patterns = [
  { name: "Singleton", dir: "src/singleton", template: "./templates/singleton-service.hbs" },
  { name: "Factory",   dir: "src/factory",   template: "./templates/factory-service.hbs" },
  { name: "Observer",  dir: "src/observer",  template: "./templates/observer-service.hbs" },
  { name: "Builder",   dir: "src/builder",   template: "./templates/builder-service.hbs" },
];

// Clean old output
for (const p of patterns) {
  if (fs.existsSync(p.dir)) fs.rmSync(p.dir, { recursive: true });
}

for (const p of patterns) {
  console.log(`\n── Generating ${p.name} pattern → ${p.dir}/ ──`);
  const modelsTemplate = p.name === "Builder"
    ? "./templates/builder-models.hbs"
    : "./templates/shared/models.hbs";
  execSync(
    `npx specshot generate --file ./openapi.json --output ${p.dir} ` +
    `--template-service ${p.template} ` +
    `--template-models ${modelsTemplate} ` +
    `--template-types ./templates/shared/types.hbs ` +
    `--template-index ./templates/shared/index.hbs ` +
    `--template-interceptors-index ./templates/shared/interceptors-index.hbs`,
    { stdio: "inherit" },
  );
}

console.log("\n✔ All 4 patterns generated:");
for (const p of patterns) {
  const files = fs.readdirSync(p.dir).filter((f) => f.endsWith(".ts"));
  console.log(`  ${p.name.padEnd(10)} → ${p.dir}/ (${files.join(", ")})`);
}
