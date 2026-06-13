import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { program } from "../cli.js";

const fixturePath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "fixtures",
  "petstore.json",
);
const fixture = fs.readFileSync(fixturePath, "utf8");

describe("CLI", () => {
  it("should have correct name and description", () => {
    expect(program.name()).toBe("specshot");
    expect(program.description()).toContain("OpenAPI");
  });

  it("should read version from package.json", () => {
    expect(program.version()).toBeDefined();
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  describe("commands", () => {
    it("should register init command", () => {
      const cmd = program.commands.find((c) => c.name() === "init");
      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain("Initialize");
    });

    it("should register generate command", () => {
      const cmd = program.commands.find((c) => c.name() === "generate");
      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain("Generate");
    });
  });

  describe("generate command options", () => {
    it("should have --url, --output, --dry-run options", () => {
      const cmd = program.commands.find((c) => c.name() === "generate")!;
      const longs = cmd.options.map((o) => o.long);
      expect(longs).toContain("--url");
      expect(longs).toContain("--output");
      expect(longs).toContain("--dry-run");
      expect(longs).toContain("--alias");
      expect(longs).toContain("--templates");
    });
  });

  describe("generate --dry-run", () => {
    let consoleLogSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => JSON.parse(fixture),
      } as Response)) as typeof fetch;
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      globalThis.fetch = originalFetch;
      (program as any)._optionValues = {};
    });

    it("should log what would be generated without writing files", async () => {
      const tmpDir = path.join(os.tmpdir(), `specshot-cli-test-${Date.now()}`);
      const outputDir = path.join(tmpDir, "services");
      fs.mkdirSync(outputDir, { recursive: true });

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--url",
        "https://example.com/openapi.json",
        "--output",
        outputDir,
        "--dry-run",
      ]);

      const logs = consoleLogSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(logs).toContain("DRY RUN");
      expect(logs).toContain("https://example.com/openapi.json");
      expect(logs).toContain("Endpoints");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate error handling", () => {
    let consoleErrorSpy: any;
    let consoleLogSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      } as Response)) as typeof fetch;
      (program as any)._optionValues = {};
      (program.commands.find((c) => c.name() === "generate")! as any)._optionValues = {};
    });

    afterAll(() => {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      globalThis.fetch = originalFetch;
    });

    it("should report fetch errors", async () => {
      const tmpDir = path.join(os.tmpdir(), `specshot-cli-err-${Date.now()}`);
      const outputDir = path.join(tmpDir, "services");
      fs.mkdirSync(outputDir, { recursive: true });

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--url",
        "https://example.com/notfound.json",
        "--output",
        outputDir,
      ]);

      const errors = consoleErrorSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(errors).toContain("not found");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
