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

  // Test 1
  it("should scaffold with default interactive prompts", async () => {
    const result = await runCli(["init"], {
      cwd: tmpDir,
      stdinInputs: ["", "", "", "", "", ""],
    });

    expect(result.code).toBe(0);
    const combinedOutput = result.stdout + result.stderr;
    expect(combinedOutput).toContain("SpecShot");
    expect(combinedOutput).toContain("API Core installed");

    expect(fs.existsSync(path.join(tmpDir, "src/lib/api/core"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/lib/api/default"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "specshot.config.mjs"))).toBe(true);
  });

  // Test 2
  it("should scaffold cleanly when all options are provided via CLI flags", async () => {
    const result = await runCli(
      [
        "init",
        "--core-dir",
        "custom/core",
        "--provider-dir",
        "custom/provider",
        "--integration",
        "none",
        "--interceptors",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
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
    expect(result.stdout).toContain("--core-dir");
    expect(result.stdout).toContain("--provider-dir");
  });

  // Test 5
  it("should enforce custom core-dir path structure", async () => {
    const result = await runCli(
      [
        "init",
        "--core-dir",
        "my-api-libs/core-files",
        "--provider-dir",
        "my-api-libs/provider-files",
        "--integration",
        "swr",
        "--interceptors",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "my-api-libs/core-files"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(tmpDir, "my-api-libs/core-files/api-client.ts")),
    ).toBe(true);
  });

  // Test 6
  it("should enforce custom provider-dir path structure", async () => {
    const result = await runCli(
      [
        "init",
        "--core-dir",
        "my-api-libs/core-files",
        "--provider-dir",
        "my-api-libs/provider-files",
        "--integration",
        "swr",
        "--interceptors",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "my-api-libs/provider-files"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(tmpDir, "my-api-libs/provider-files/interceptors"),
      ),
    ).toBe(true);
  });

  // Test 7
  it("should generate a valid specshot.json configuration file", async () => {
    await runCli(
      [
        "init",
        "--core-dir",
        "libs/core",
        "--provider-dir",
        "libs/prov",
        "--integration",
        "swr",
        "--interceptors",
        "bearer,logger",
        "--url",
        "http://api.example.com/swagger.json",
      ],
      { cwd: tmpDir },
    );

    const configPath = path.join(tmpDir, "specshot.config.mjs");
    expect(fs.existsSync(configPath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("coreDir: \"libs/core\"");
    expect(configContent).toContain("providerDir: \"libs/prov\"");
    expect(configContent).toContain("integration: \"swr\"");
    expect(configContent).toContain("bearer");
    expect(configContent).toContain("logger");
    expect(configContent).toContain("http://api.example.com/swagger.json");
  });

  // Test 8
  it("should scaffold SWR integration skeleton when requested", async () => {
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

    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(true);
    const hooksContent = fs.readFileSync(
      path.join(tmpDir, "prov/hooks.ts"),
      "utf-8",
    );
    expect(hooksContent).toContain("useSWR");
  });

  // Test 9
  it("should scaffold TanStack Query integration skeleton when requested", async () => {
    await runCli(
      [
        "init",
        "--integration",
        "react-query",
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

    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(true);
    const hooksContent = fs.readFileSync(
      path.join(tmpDir, "prov/hooks.ts"),
      "utf-8",
    );
    expect(hooksContent).toContain("useQuery");
  });

  // Test 10
  it("should scaffold None (vanilla TS fetch) integration skeleton when requested", async () => {
    await runCli(
      [
        "init",
        "--integration",
        "none",
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

    expect(fs.existsSync(path.join(tmpDir, "prov/client.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "prov/hooks.ts"))).toBe(false);
  });

  // Test 11
  it("should copy custom Handlebars templates directory if provided", async () => {
    await runCli(
      [
        "init",
        "--core-dir",
        "core",
        "--provider-dir",
        "prov",
        "--integration",
        "none",
        "--templates",
        "my-custom-templates",
        "--interceptors",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    const configPath = path.join(tmpDir, "specshot.config.mjs");
    expect(fs.existsSync(configPath)).toBe(true);
    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("templates: \"my-custom-templates\"");
  });

  // Test 12
  it("should include specified interceptors in scaffolding", async () => {
    await runCli(
      [
        "init",
        "--interceptors",
        "bearer",
        "--core-dir",
        "core",
        "--provider-dir",
        "prov",
        "--integration",
        "none",
        "--url",
        "",
      ],
      { cwd: tmpDir },
    );

    const interceptorDir = path.join(tmpDir, "prov/interceptors");
    expect(fs.existsSync(path.join(interceptorDir, "bearer.ts"))).toBe(true);
    expect(fs.existsSync(path.join(interceptorDir, "logger.ts"))).toBe(false);
  });
});
