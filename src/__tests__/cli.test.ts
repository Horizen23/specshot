import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import Handlebars from "handlebars";
import { fileURLToPath } from "url";
import { program } from "../cli/cli.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      expect(cmd?.description()).toContain("Scaffold");
    });

    it("should register generate command", () => {
      const cmd = program.commands.find((c) => c.name() === "generate");
      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain("Generate");
    });
  });

  describe("generate command options", () => {
    it("should have --url, --output, --file, --dry-run options", () => {
      const cmd = program.commands.find((c) => c.name() === "generate")!;
      const longs = cmd.options.map((o) => o.long);
      expect(longs).toContain("--url");
      expect(longs).toContain("--file");
      expect(longs).toContain("--output");
      expect(longs).toContain("--dry-run");
      expect(longs).toContain("--alias");
      expect(longs).toContain("--templates");
      expect(longs).toContain("--config");
    });
  });

  describe("generate --config", () => {
    let consoleLogSpy: any;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should read config from custom path", async () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `specshot-cli-config-${Date.now()}`,
      );
      const outputDir = path.join(tmpDir, "services");
      const configPath = path.join(tmpDir, "my-config.json");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          providerDir: path.join(tmpDir, "custom-provider"),
        }),
      );

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--file",
        fixturePath,
        "--output",
        outputDir,
        "--config",
        configPath,
      ]);

      // Should prefer explicit --output over config
      const logs = consoleLogSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(logs).toContain("Generated pets.service.ts");
      expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate --file", () => {
    let consoleLogSpy: any;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should generate from local file", async () => {
      const tmpDir = path.join(os.tmpdir(), `specshot-cli-file-${Date.now()}`);
      const outputDir = path.join(tmpDir, "services");
      fs.mkdirSync(outputDir, { recursive: true });

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--file",
        fixturePath,
        "--output",
        outputDir,
      ]);

      const logs = consoleLogSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(logs).toContain("Generated pets.service.ts");
      expect(logs).toContain("Generated stores.service.ts");
      expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate --dry-run", () => {
    let consoleLogSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => JSON.parse(fixture),
        }) as Response) as typeof fetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      globalThis.fetch = originalFetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
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
      globalThis.fetch = (async () =>
        ({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({}),
        }) as Response) as typeof fetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
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

      const errors = consoleErrorSpy.mock.calls
        .map((c: any) => c[0])
        .join("\n");
      expect(errors).toContain("not found");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate --alias", () => {
    let consoleLogSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => JSON.parse(fixture),
        }) as Response) as typeof fetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      globalThis.fetch = originalFetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should use alias in generated service imports", async () => {
      const tmpDir = path.join(os.tmpdir(), `specshot-cli-alias-${Date.now()}`);
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
        "--alias",
        "@/my-api",
      ]);

      const svcContent = fs.readFileSync(
        path.join(outputDir, "pets.service.ts"),
        "utf8",
      );
      expect(svcContent).toContain('"@/my-api/core/base-service"');
      expect(svcContent).toContain('"@/my-api/core/api-client"');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate with config providing url", () => {
    let consoleLogSpy: any;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should read openapiUrl and providerDir from config", async () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `specshot-cli-config-url-${Date.now()}`,
      );
      const providerDir = path.join(tmpDir, "auto-services");
      const configPath = path.join(tmpDir, "specshot.json");
      fs.mkdirSync(providerDir, { recursive: true });
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          apis: {
            default: {
              openapiUrl: fixturePath,
              providerDir: providerDir,
            },
          },
        }),
      );

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--config",
        configPath,
      ]);

      const servicesDir = path.join(providerDir, "services");
      expect(fs.existsSync(path.join(servicesDir, "models.ts"))).toBe(true);
      expect(fs.existsSync(path.join(servicesDir, "pets.service.ts"))).toBe(
        true,
      );

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate --templates", () => {
    let consoleLogSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            openapi: "3.0.0",
            paths: {
              "/tasks": {
                get: {
                  tags: ["tasks"],
                  operationId: "listTasks",
                  responses: { "200": { description: "OK" } },
                },
              },
            },
          }),
        }) as Response) as typeof fetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      globalThis.fetch = originalFetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should use custom templates passed via --templates", async () => {
      const tmpDir = path.join(os.tmpdir(), `specshot-cli-tpl-${Date.now()}`);
      const outputDir = path.join(tmpDir, "services");
      const tplDir = path.join(tmpDir, "my-templates");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.mkdirSync(tplDir, { recursive: true });

      fs.writeFileSync(path.join(tplDir, "models.hbs"), `// CLI-TPL models\n`);
      fs.writeFileSync(
        path.join(tplDir, "types.hbs"),
        `// CLI-TPL {{tag}} types\n{{#each operations}}\nexport type {{typeNameResponse}} = void;\n{{/each}}\n// --- CUSTOM CODE START ---\n{{#if customCode}}{{{customCode}}}{{/if}}\n// --- CUSTOM CODE END ---\n`,
      );
      fs.writeFileSync(
        path.join(tplDir, "service.hbs"),
        `// CLI-TPL {{className}} service\nimport { BaseService } from "{{corePath}}/base-service";\n// --- CUSTOM CODE START ---\n{{#if customCode}}{{{customCode}}}{{/if}}\n// --- CUSTOM CODE END ---\n`,
      );
      fs.writeFileSync(path.join(tplDir, "index.hbs"), `// CLI-TPL index\n`);
      fs.writeFileSync(
        path.join(tplDir, "interceptors-index.hbs"),
        `// CLI-TPL interceptors\n`,
      );

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--url",
        "https://example.com/tpl.json",
        "--output",
        outputDir,
        "--templates",
        tplDir,
      ]);

      const modelsContent = fs.readFileSync(
        path.join(outputDir, "models.ts"),
        "utf8",
      );
      expect(modelsContent).toContain("CLI-TPL models");

      const typesContent = fs.readFileSync(
        path.join(outputDir, "tasks.types.ts"),
        "utf8",
      );
      expect(typesContent).toContain("CLI-TPL tasks types");

      const svcContent = fs.readFileSync(
        path.join(outputDir, "tasks.service.ts"),
        "utf8",
      );
      expect(svcContent).toContain("CLI-TPL TasksService service");

      const indexContent = fs.readFileSync(
        path.join(path.dirname(outputDir), "index.ts"),
        "utf8",
      );
      expect(indexContent).toContain("CLI-TPL index");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generate --config missing file", () => {
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let originalFetch: typeof fetch;

    beforeAll(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            openapi: "3.0.0",
            paths: {
              "/ping": {
                get: {
                  tags: ["ping"],
                  operationId: "ping",
                  responses: { "200": { description: "OK" } },
                },
              },
            },
          }),
        }) as Response) as typeof fetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    afterAll(() => {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      globalThis.fetch = originalFetch;
      (program as any)._optionValues = {};
      (
        program.commands.find((c) => c.name() === "generate")! as any
      )._optionValues = {};
    });

    it("should fall back gracefully when config file does not exist", async () => {
      const tmpDir = path.join(
        os.tmpdir(),
        `specshot-cli-missing-cfg-${Date.now()}`,
      );
      const outputDir = path.join(tmpDir, "services");
      fs.mkdirSync(outputDir, { recursive: true });

      await program.parseAsync([
        "node",
        "cli.js",
        "generate",
        "--url",
        "https://example.com/ping.json",
        "--output",
        outputDir,
        "--config",
        "/nonexistent/config.json",
      ]);

      // Should generate services normally despite missing config
      expect(fs.existsSync(path.join(outputDir, "ping.service.ts"))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("react-query integration", () => {
    it("should have react-query hooks template", () => {
      const tplPath = path.join(
        __dirname,
        "../../templates/integrations/react-query/hooks.hbs",
      );
      expect(fs.existsSync(tplPath)).toBe(true);
    });

    it("should compile react-query hooks template to valid TypeScript", () => {
      const tplPath = path.join(
        __dirname,
        "../../templates/integrations/react-query/hooks.hbs",
      );
      const templateStr = fs.readFileSync(tplPath, "utf8");
      const template = Handlebars.compile(templateStr);
      const result = template({ corePath: "../core" });

      // Verify imports
      expect(result).toContain('"@tanstack/react-query"');
      expect(result).toContain("useQuery");
      expect(result).toContain("useQueryClient");
      expect(result).toContain("UseQueryResult");

      // Verify query key factory
      expect(result).toContain("queryKeys");
      expect(result).toContain('all: ["api"] as const');
      expect(result).toContain("service: (serviceName: string)");
      expect(result).toContain(
        "method: (serviceName: string, methodName: string)",
      );

      // Verify proxy types
      expect(result).toContain("RQProxyMethod");
      expect(result).toContain("RQProxyService");
      expect(result).toContain("ApiHooksProxy");

      // Verify proxy implementation
      expect(result).toContain("createApiHooks");
      expect(result).toContain("useQueryClient");
      expect(result).toContain("invalidateQueries");

      // Verify error types
      expect(result).toContain("ApiHookError");

      // Verify it's a client component
      expect(result).toContain('"use client"');
    });

    it("should generate queryKey and invalidate helpers on hook methods", () => {
      const tplPath = path.join(
        __dirname,
        "../../templates/integrations/react-query/hooks.hbs",
      );
      const templateStr = fs.readFileSync(tplPath, "utf8");
      const template = Handlebars.compile(templateStr);
      const result = template({ corePath: "../core" });

      // queryKey assignment
      expect(result).toContain("hookFn.queryKey");

      // invalidate assignment
      expect(result).toContain("hookFn.invalidate");
    });

    it("should exclude abort/getSignal/withSignal from proxy mapping (same as SWR)", () => {
      const tplPath = path.join(
        __dirname,
        "../../templates/integrations/react-query/hooks.hbs",
      );
      const templateStr = fs.readFileSync(tplPath, "utf8");
      const template = Handlebars.compile(templateStr);
      const result = template({ corePath: "../core" });

      expect(result).toContain("abort");
      expect(result).toContain("getSignal");
      expect(result).toContain("withSignal");
      expect(result).toContain("extends (...args: any[]) => Promise<any>");
    });
  });
});
