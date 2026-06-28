import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import path from "path";
import fs from "fs";
import http from "http";
import { fileURLToPath } from "url";
import { runCli, createTmpDir } from "./e2e-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, "../fixtures/petstore.json");
const petstoreJson = fs.readFileSync(fixturePath, "utf-8");

describe("F2 Code Generation (generate command)", () => {
  let tmpDir: string;
  let httpServer: http.Server;
  let httpPort: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(petstoreJson);
      });
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        httpPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(() => {
    httpServer.close();
  });

  beforeEach(() => {
    tmpDir = createTmpDir("specshot-codegen-test");
  });

  function writeConfig(config: Record<string, unknown>) {
    const content = `export default ${JSON.stringify(config, null, 2)};\n`;
    fs.writeFileSync(path.join(tmpDir, "specshot.config.mjs"), content);
  }

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Test 1
  it("should fail when generate is invoked without specifying file or url", async () => {
    const result = await runCli(["generate"], { cwd: tmpDir });
    expect(result.stdout + result.stderr).toContain(
      "OpenAPI JSON URL or local file path",
    );
  });

  // Test 2
  it("should print what would be generated without writing to disk during dry run", async () => {
    const outputDir = path.join(tmpDir, "out");
    const result = await runCli(
      ["generate", "--file", fixturePath, "--output", outputDir, "--dry-run"],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("[DRY RUN] Would generate");
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  // Test 3
  it("should handle non-existent local file path gracefully", async () => {
    const result = await runCli(
      [
        "generate",
        "--file",
        path.join(tmpDir, "nonexistent.json"),
        "--output",
        path.join(tmpDir, "out"),
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(result.stderr + result.stdout).toContain(
      "Failed to generate API services",
    );
  });

  // Test 4
  it("should fail when configuration file specshot.json is missing or corrupted", async () => {
    const result = await runCli(
      [
        "generate",
        "--file",
        fixturePath,
        "--output",
        path.join(tmpDir, "out"),
        "--config",
        path.join(tmpDir, "invalid-specshot.json"),
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
  });

  // Test 5
  it("should fail on invalid spec contents", async () => {
    const badSpecPath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badSpecPath, "{ invalid json }");

    const result = await runCli(
      ["generate", "--file", badSpecPath, "--output", path.join(tmpDir, "out")],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(result.stderr + result.stdout).toContain(
      "Failed to generate API services",
    );
  });

  // Test 6
  it("should generate code successfully from a valid local JSON file", async () => {
    const outputDir = path.join(tmpDir, "out");
    const result = await runCli(
      ["generate", "--file", fixturePath, "--output", outputDir],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(outputDir, "pets.service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "pets.types.ts"))).toBe(true);
  });

  // Test 7
  it("should generate code successfully from a remote URL spec", async () => {
    const outputDir = path.join(tmpDir, "out");
    const result = await runCli(
      [
        "generate",
        "--url",
        `http://localhost:${httpPort}/openapi.json`,
        "--output",
        outputDir,
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(outputDir, "pets.service.ts"))).toBe(true);
  });

  // Test 8
  it("should generate code with import alias prefix options", async () => {
    const outputDir = path.join(tmpDir, "out");
    const result = await runCli(
      [
        "generate",
        "--file",
        fixturePath,
        "--output",
        outputDir,
        "--alias",
        "@custom-alias/api",
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    const serviceContent = fs.readFileSync(
      path.join(outputDir, "pets.service.ts"),
      "utf-8",
    );
    expect(serviceContent).toContain("@custom-alias/api");
  });

  // Test 9
  it("should generate with custom Handlebars templates override", async () => {
    const outputDir = path.join(tmpDir, "out");
    const customTplDir = path.join(tmpDir, "templates");
    fs.mkdirSync(customTplDir, { recursive: true });

    // Build metadata structure matching the default templates
    function writeTpl(subdir: string, tplFile: string, meta: { target: string; name?: string; iterate?: string }, content: string) {
      const d = path.join(customTplDir, subdir);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, "_target.hbs"), meta.target);
      if (meta.name) fs.writeFileSync(path.join(d, "_name.hbs"), meta.name);
      if (meta.iterate) fs.writeFileSync(path.join(d, "_iterate.hbs"), meta.iterate);
      fs.writeFileSync(path.join(d, tplFile), content);
    }
    writeTpl("models", "models.hbs", { target: "{{outputDir}}", name: "models.ts" }, "// custom models {{version}}");
    writeTpl("types-per-tag", "types.hbs", { target: "{{outputDir}}", name: "{{tagPrefix}}.types.ts", iterate: "tags" }, "// custom types");
    writeTpl("service-per-tag", "service.hbs", { target: "{{outputDir}}", name: "{{tagPrefix}}.service.ts", iterate: "tags" }, "// custom service");
    writeTpl("plugins", "plugins-index.hbs", { target: "{{outputDir}}/../plugins", name: "index.ts" }, "// custom plugins");
    writeTpl("index", "index.hbs", { target: "{{outputDir}}/..", name: "index.ts" }, "// custom index");

    const result = await runCli(
      [
        "generate",
        "--file",
        fixturePath,
        "--output",
        outputDir,
        "--templates",
        customTplDir,
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    const modelsContent = fs.readFileSync(
      path.join(outputDir, "models.ts"),
      "utf-8",
    );
    expect(modelsContent).toContain("custom models");
  });

  // Test 10
  it("should generate MSW handlers when --msw option is enabled", async () => {
    const outputDir = path.join(tmpDir, "out");
    const result = await runCli(
      ["generate", "--file", fixturePath, "--output", outputDir, "--msw"],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "msw/handlers/index.ts"))).toBe(
      true,
    );
  });

  // Test 11
  it("should integrate formatCode formatting automatically on output", async () => {
    const outputDir = path.join(tmpDir, "out");
    await runCli(["generate", "--file", fixturePath, "--output", outputDir], {
      cwd: tmpDir,
    });

    const modelsContent = fs.readFileSync(
      path.join(outputDir, "pets.types.ts"),
      "utf-8",
    );
    expect(modelsContent).not.toContain(";;");
  });

  // Test 12
  it("should preserve custom code markers on regeneration", async () => {
    const outputDir = path.join(tmpDir, "out");

    await runCli(["generate", "--file", fixturePath, "--output", outputDir], {
      cwd: tmpDir,
    });

    const servicePath = path.join(outputDir, "pets.service.ts");
    let content = fs.readFileSync(servicePath, "utf-8");

    expect(content).toContain("// --- CUSTOM CODE START ---");
    expect(content).toContain("// --- CUSTOM CODE END ---");

    const markerStart = "// --- CUSTOM CODE START ---";
    const markerEnd = "// --- CUSTOM CODE END ---";
    const customImplementation = "\n  // MY CUSTOM CODE HERE\n  ";

    const parts = content.split(markerStart);
    const subParts = parts[1].split(markerEnd);
    const updatedContent =
      parts[0] + markerStart + customImplementation + markerEnd + subParts[1];

    fs.writeFileSync(servicePath, updatedContent);

    // Regenerate
    await runCli(["generate", "--file", fixturePath, "--output", outputDir], {
      cwd: tmpDir,
    });

    const regeneratedContent = fs.readFileSync(servicePath, "utf-8");
    expect(regeneratedContent).toContain("// MY CUSTOM CODE HERE");
  });

  // Test 13
  it("should generate files with SWR integration provider", async () => {
    const outputDir = path.join(tmpDir, "out");

    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "core",
        outDir: "prov",
        hook: "swr",
        pluginNames: [],
      },
    });

    const result = await runCli(
      ["generate", "--file", fixturePath, "--output", outputDir],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(outputDir, "pets.types.ts"))).toBe(true);
  });
});
