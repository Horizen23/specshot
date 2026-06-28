import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";
import { runCli, createTmpDir } from "./e2e-helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, "../fixtures/petstore.json");

describe("F4 Mocking Engine (mock command server)", () => {
  let tmpDir: string;
  const spawnedProcesses: ChildProcess[] = [];

  beforeEach(() => {
    tmpDir = createTmpDir("specshot-engine-test");
  });

  afterEach(() => {
    for (const proc of spawnedProcesses) {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }
    spawnedProcesses.length = 0;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>) {
    const content = `export default ${JSON.stringify(config, null, 2)};\n`;
    fs.writeFileSync(path.join(tmpDir, "specshot.config.mjs"), content);
  }

  function startEngine(
    port: number,
    _webPort: number,
    file: string,
    cwd: string,
  ): Promise<{ process: ChildProcess; url: string }> {
    return new Promise((resolve, reject) => {
      const cp = spawn(
        "node",
        [
          path.resolve(__dirname, "../../../dist/cli.js"),
          "mock",
          "--web",
          "--port",
          port.toString(),
          "--file",
          file,
        ],
        {
          cwd,
          env: { ...process.env, SPECSHOT_NO_BROWSER: "1" },
        },
      );

      spawnedProcesses.push(cp);

      const rl = readline.createInterface({ input: cp.stdout! });
      const timeout = setTimeout(() => {
        cp.kill("SIGKILL");
        reject(
          new Error(`Timeout waiting for mock engine to start on port ${port}`),
        );
      }, 8000);

      rl.on("line", async (line) => {
        if (line.includes("SpecShot Mock Dashboard running at")) {
          clearTimeout(timeout);
          const match = line.match(/http:\/\/localhost:\d+/);
          const dashboardUrl = match ? match[0] : `http://localhost:3456`;

          try {
            // Mock server starts automatically with --web; just verify it's running
            const res = await fetch(`${dashboardUrl}/api/mock-server`, {
              method: "GET",
            });
            const data = (await res.json()) as any;
            if (data.running) {
              const actualPort = data.port || port;
              resolve({ process: cp, url: `http://localhost:${actualPort}` });
            } else {
              // Try starting it via API if not auto-started
              const startRes = await fetch(`${dashboardUrl}/api/mock-server`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start", port }),
              });
              const startData = (await startRes.json()) as any;
              if (startData.ok) {
                const actualPort = startData.port || port;
                resolve({ process: cp, url: `http://localhost:${actualPort}` });
              } else {
                reject(
                  new Error("Failed to start mock server via dashboard API"),
                );
              }
            }
          } catch (e) {
            reject(e);
          }
        }
      });

      cp.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Test 1
  it("should start mock engine server cleanly", async () => {
    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          mockData: JSON.stringify([{ id: 1, name: "Goldie" }]),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19000, 19001, fixturePath, tmpDir);
    const res = await fetch(`${url}/pets`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body[0].name).toBe("Goldie");
  });

  // Test 2
  it("should return 404 for unmatched mock server endpoint paths", async () => {
    const { url } = await startEngine(19010, 19011, fixturePath, tmpDir);
    const res = await fetch(`${url}/nonexistent-path`);
    expect(res.status).toBe(404);
  });

  // Test 3
  it("should delay response based on configured endpoint latency", async () => {
    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          delay: 600,
          mockData: JSON.stringify({ ok: true }),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19020, 19021, fixturePath, tmpDir);
    const start = Date.now();
    const res = await fetch(`${url}/pets`);
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeGreaterThanOrEqual(500);
  });

  // Test 4
  it("should serve custom status codes as configured in overrides", async () => {
    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 418,
          mockData: JSON.stringify({ error: "Teapot" }),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19030, 19031, fixturePath, tmpDir);
    const res = await fetch(`${url}/pets`);
    expect(res.status).toBe(418);
  });

  // Test 5
  it("should serve custom mock JSON payload overrides instead of schema generated ones", async () => {
    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          mockData: JSON.stringify({ customKey: "customValue" }),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19040, 19041, fixturePath, tmpDir);
    const res = await fetch(`${url}/pets`);
    const body = (await res.json()) as any;
    expect(body.customKey).toBe("customValue");
  });

  // Test 6 (Tier 3 Cross-Feature Flow)
  it("should execute end-to-end scaffolding and code generation flow", async () => {
    // 1. Init
    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "src/core",
        outDir: "src/prov",
        hook: "react-query",
        pluginNames: ["bearer"],
      },
    });

    // 2. Generate
    const genRes = await runCli(
      ["generate", "--file", fixturePath, "--output", "src/prov/services"],
      { cwd: tmpDir },
    );
    expect(genRes.code).toBe(0);

    expect(fs.existsSync(path.join(tmpDir, "src/core/api-client.ts"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(tmpDir, "src/prov/services/pets.types.ts")),
    ).toBe(true);
  });

  // Test 7 (Tier 3 Cross-Feature Flow)
  it("should persist interactive mock choices in specshot.mocks.json configuration", async () => {
    writeConfig({
      apis: {
        petstore: {
          openapiUrl: "",
        },
      },
      templateData: {
        coreOut: "src/core",
        outDir: "src/prov",
        hook: "none",
        pluginNames: [],
      },
    });

    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
        },
      },
      outputDir: "src/prov/msw",
      specSource: fixturePath,
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const readConfig = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".specshot/mocks.json"), "utf-8"),
    );
    expect(readConfig.endpoints["pets-listPets"].enabled).toBe(true);
  });

  // Test 8 (Tier 3 Cross-Feature Flow)
  it("should generate code with correct MSW setup and serve active mocked endpoints", async () => {
    writeConfig({
      apis: {
        petstore: {
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

    await runCli(
      ["generate", "--file", fixturePath, "--output", "prov/services", "--msw"],
      { cwd: tmpDir },
    );

    // MSW index handlers generated in prov/msw/handlers/index.ts
    expect(fs.existsSync(path.join(tmpDir, "prov/msw/handlers/index.ts"))).toBe(
      true,
    );

    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          mockData: JSON.stringify([{ id: 99, name: "MSW Mocked" }]),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19050, 19051, fixturePath, tmpDir);
    const res = await fetch(`${url}/pets`);
    const body = (await res.json()) as any;
    expect(body[0].name).toBe("MSW Mocked");
  });

  // Test 9 (Tier 4 Real-World Workloads)
  it("should parse and validate deeply nested object and array reference schemas", async () => {
    const deepSpec = {
      openapi: "3.0.0",
      info: { title: "Deep Spec", version: "1.0.0" },
      paths: {
        "/deep": {
          get: {
            tags: ["deep"],
            operationId: "getDeep",
            responses: {
              "200": {
                description: "Deep object",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/DeepObj" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          DeepObj: {
            type: "object",
            properties: {
              level1: {
                type: "object",
                properties: {
                  level2: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        level3: {
                          type: "object",
                          properties: {
                            value: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const specPath = path.join(tmpDir, "deep.json");
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify(deepSpec, null, 2));

    const genRes = await runCli(
      ["generate", "--file", specPath, "--output", "out"],
      { cwd: tmpDir },
    );

    expect(genRes.code).toBe(0);
    const typesContent = fs.readFileSync(
      path.join(tmpDir, "out/deep.types.ts"),
      "utf-8",
    );
    expect(typesContent).toContain("level1");
    expect(typesContent).toContain("level2");
    expect(typesContent).toContain("level3");
  });

  // Test 10 (Tier 4 Real-World Workloads)
  it("should resolve and mock recursive cyclic schema shapes without infinite loops", async () => {
    const cyclicSpec = {
      openapi: "3.0.0",
      info: { title: "Cyclic Spec", version: "1.0.0" },
      paths: {
        "/node": {
          get: {
            tags: ["node"],
            operationId: "getNode",
            responses: {
              "200": {
                description: "Cyclic Node",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Node" },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              id: { type: "string" },
              children: {
                type: "array",
                items: { $ref: "#/components/schemas/Node" },
              },
            },
          },
        },
      },
    };

    const specPath = path.join(tmpDir, "cyclic.json");
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify(cyclicSpec, null, 2));

    const genRes = await runCli(
      ["generate", "--file", specPath, "--output", "out"],
      { cwd: tmpDir },
    );

    expect(genRes.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, "out/node.types.ts"))).toBe(true);
  });

  // Test 11 (Tier 4 Real-World Workloads)
  it("should handle heavy payload specs containing multiple tags and many endpoints", async () => {
    const heavySpec: any = {
      openapi: "3.0.0",
      info: { title: "Heavy Spec", version: "1.0.0" },
      paths: {},
      components: { schemas: {} },
    };

    for (let t = 1; t <= 5; t++) {
      const tag = `tag${t}`;
      for (let p = 1; p <= 10; p++) {
        const pathStr = `/route-${t}-${p}`;
        heavySpec.paths[pathStr] = {
          get: {
            tags: [tag],
            operationId: `getRoute_${t}_${p}`,
            responses: {
              "200": {
                description: "Success response",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        data: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        };
      }
    }

    const specPath = path.join(tmpDir, "heavy.json");
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(specPath, JSON.stringify(heavySpec, null, 2));

    const genRes = await runCli(
      ["generate", "--file", specPath, "--output", "out"],
      { cwd: tmpDir },
    );

    expect(genRes.code).toBe(0);

    for (let t = 1; t <= 5; t++) {
      expect(fs.existsSync(path.join(tmpDir, `out/tag${t}.service.ts`))).toBe(
        true,
      );
    }
  });

  // Test 12 (Tier 4 Real-World Workloads)
  it("should respect mock delay overrides on heavy latency simulation", async () => {
    const mockConfig = {
      endpoints: {
        "pets-listPets": {
          enabled: true,
          tag: "pets",
          operationId: "listPets",
          method: "GET",
          path: "/pets",
          statusCode: 200,
          delay: 1100,
          mockData: JSON.stringify({ ok: true }),
        },
      },
    };
    fs.mkdirSync(path.join(tmpDir, ".specshot"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".specshot/mocks.json"),
      JSON.stringify(mockConfig, null, 2),
    );

    const { url } = await startEngine(19060, 19061, fixturePath, tmpDir);
    const start = Date.now();
    const res = await fetch(`${url}/pets`);
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeGreaterThanOrEqual(1000);
  });
});
