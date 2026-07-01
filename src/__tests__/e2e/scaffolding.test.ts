import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { runCli, createTmpDir } from "./e2e-helper";

describe("F1 Scaffolding (init command)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir("specshot-scaffolding-test");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>) {
    const content = `export default ${JSON.stringify(config, null, 2)};\n`;
    fs.writeFileSync(path.join(tmpDir, "specshot.config.mjs"), content);
  }

  // Test 1
  it("should scaffold with default interactive prompts", async () => {
    const result = await runCli(["init"], {
      cwd: tmpDir,
      stdinInputs: ["", "", "", "", "", "", "", ""],
    });

    expect(result.code).toBe(0);
    const combinedOutput = result.stdout + result.stderr;
    expect(combinedOutput).toContain("The OpenAPI Code Generator");

    expect(fs.existsSync(path.join(tmpDir, "specshot.config.mjs"))).toBe(true);

    const result2 = await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "src/lib/api/core"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/lib/api/api"))).toBe(true);
  });

  // Test 2
  it("should scaffold cleanly when config is provided", async () => {
    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "custom/core",
        outDir: "custom/provider",
        hook: "none",
        pluginNames: [],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "custom/core"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "custom/provider"))).toBe(true);
  });

  // Test 3
  it("should handle invalid arguments gracefully", async () => {
    const result = await runCli(["init", "--invalid-flag"], { cwd: tmpDir });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("error: unknown option");
  });

  // Test 4
  it("should display help documentation for init command", async () => {
    const result = await runCli(["init", "--help"], { cwd: tmpDir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: specshot init");
  });

  // Test 5
  it("should enforce custom core-dir path structure", async () => {
    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "my-api-libs/core-files",
        outDir: "my-api-libs/provider-files",
        hook: "swr",
        pluginNames: [],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "my-api-libs/core-files"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(tmpDir, "my-api-libs/core-files/api-client.ts")),
    ).toBe(true);
  });

  // Test 6
  it("should enforce custom provider-dir path structure", async () => {
    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "my-api-libs/core-files",
        outDir: "my-api-libs/provider-files",
        hook: "swr",
        pluginNames: [],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "my-api-libs/provider-files"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(tmpDir, "my-api-libs/provider-files/client.ts")),
    ).toBe(true);
  });

  // Test 7
  it("should generate a valid specshot.json configuration file", async () => {
    writeConfig({
      apis: {
        default: {
          openapiUrl: "http://api.example.com/swagger.json",
        },
      },
      templateData: {
        coreOut: "libs/core",
        outDir: "libs/prov",
        hook: "swr",
        pluginNames: ["bearer", "logger"],
      },
    });

    const configPath = path.join(tmpDir, "specshot.config.mjs");
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("libs/core");
    expect(configContent).toContain("libs/prov");
    expect(configContent).toContain("swr");
    expect(configContent).toContain("bearer");
    expect(configContent).toContain("logger");
    expect(configContent).toContain("http://api.example.com/swagger.json");
  });

  // Test 8
  it("should scaffold SWR integration skeleton when requested", async () => {
    writeConfig({
      apis: {
        default: {
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

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(true);
    const hooksContent = fs.readFileSync(
      path.join(tmpDir, "prov/hooks.ts"),
      "utf-8",
    );
    expect(hooksContent).toContain("useSWR");
  });

  // Test 9
  it("should scaffold TanStack Query integration skeleton when requested", async () => {
    writeConfig({
      apis: {
        default: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "core",
        outDir: "prov",
        hook: "react-query",
        pluginNames: [],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(true);
    const hooksContent = fs.readFileSync(
      path.join(tmpDir, "prov/hooks.ts"),
      "utf-8",
    );
    expect(hooksContent).toContain("useQuery");
  });

  // Test 10
  it("should scaffold None (vanilla TS fetch) integration skeleton when requested", async () => {
    writeConfig({
      apis: {
        default: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "core",
        outDir: "prov",
        hook: "none",
        pluginNames: [],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "prov/client.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(false);
  });

  // Test 11
  it("should copy custom Handlebars templates directory if provided", async () => {
    await runCli(["init", "--templates", "my-custom-templates", "--url", ""], {
      cwd: tmpDir,
      stdinInputs: ["prov", "", "", "", "", ""],
    });

    const configPath = path.join(tmpDir, "specshot.config.mjs");
    expect(fs.existsSync(configPath)).toBe(true);
    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain('templates: "my-custom-templates"');
  });

  // Test 12
  it("should include specified interceptors in scaffolding", async () => {
    writeConfig({
      apis: {
        default: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "core",
        outDir: "prov",
        hook: "none",
        pluginNames: ["bearer"],
      },
    });

    await runCli(["generate"], { cwd: tmpDir });
    const interceptorDir = path.join(tmpDir, "prov/plugins");
    expect(fs.existsSync(path.join(interceptorDir, "bearer.ts"))).toBe(true);
    expect(fs.existsSync(path.join(interceptorDir, "logger.ts"))).toBe(false);
  });
});
