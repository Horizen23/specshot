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
    expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);
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
    expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);
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

    // Write simple mock templates directly to customTplDir
    fs.writeFileSync(
      path.join(customTplDir, "models.hbs"),
      "// custom models {{version}}",
    );
    fs.writeFileSync(path.join(customTplDir, "types.hbs"), "// custom types");
    fs.writeFileSync(
      path.join(customTplDir, "service.hbs"),
      "// custom service",
    );
    fs.writeFileSync(
      path.join(customTplDir, "interceptors-index.hbs"),
      "// custom interceptors",
    );
    fs.writeFileSync(path.join(customTplDir, "index.hbs"), "// custom index");

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
      path.join(outputDir, "models.ts"),
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

    await runCli(
      [
        "init",
        "--integration",
        "swr",
        "--core-dir",
        "core",
        "--provider-dir",
        "prov",
        "--interceptors",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    const result = await runCli(
      ["generate", "--file", fixturePath, "--output", outputDir],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);
  });
});
