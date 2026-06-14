import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { generateApi } from "../core/generate.js";

const tmpDir = path.join(os.tmpdir(), `specshot-test-${Date.now()}`);
const outputDir = path.join(tmpDir, "src", "lib", "api", "__generated__");

beforeAll(() => {
  const fixturePath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "fixtures",
    "petstore.json",
  );
  const fixture = fs.readFileSync(fixturePath, "utf8");

  globalThis.fetch = (async (url: string) => {
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => JSON.parse(fixture),
    } as Response;
  }) as typeof fetch;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateApi", () => {
  it("generates service files from an OpenAPI spec", async () => {
    await generateApi("https://example.com/openapi.json", outputDir);

    expect(fs.existsSync(path.join(outputDir, "models.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "pets.service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "pets.types.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "stores.service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "stores.types.ts"))).toBe(true);

    const modelsContent = fs.readFileSync(
      path.join(outputDir, "models.ts"),
      "utf8",
    );
    expect(modelsContent).toContain("export const Pet");

    const storesTypes = fs.readFileSync(
      path.join(outputDir, "stores.types.ts"),
      "utf8",
    );
    expect(storesTypes).toContain("export const Store");

    const petsTypes = fs.readFileSync(
      path.join(outputDir, "pets.types.ts"),
      "utf8",
    );
    expect(petsTypes).toContain("export const CreatePetRequest");

    const petsService = fs.readFileSync(
      path.join(outputDir, "pets.service.ts"),
      "utf8",
    );
    expect(petsService).toContain("class petsService");
    expect(petsService).toContain("listPets");
    expect(petsService).toContain("createPet");
    expect(petsService).toContain("getPet");

    const storesService = fs.readFileSync(
      path.join(outputDir, "stores.service.ts"),
      "utf8",
    );
    expect(storesService).toContain("class storesService");
    expect(storesService).toContain("listStores");
  });

  it("handles empty spec with no paths", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ openapi: "3.0.0", paths: {} }),
      }) as Response) as typeof fetch;

    const emptyDir = path.join(tmpDir, "empty");
    await expect(
      generateApi("https://example.com/empty.json", emptyDir),
    ).rejects.toThrow("has no endpoints");
  });

  it("handles 404 fetch error", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      }) as Response) as typeof fetch;

    await expect(
      generateApi("https://example.com/notfound.json", outputDir),
    ).rejects.toThrow("not found");
  });

  it("handles HTTP 500 fetch error", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({}),
      }) as Response) as typeof fetch;

    await expect(
      generateApi("https://example.com/server-error.json", outputDir),
    ).rejects.toThrow("HTTP 500");
  });

  it("generates from local file", async () => {
    const fixtureFile = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "fixtures",
      "petstore.json",
    );
    const localOutput = path.join(tmpDir, "from-file");
    await generateApi(fixtureFile, localOutput);

    expect(fs.existsSync(path.join(localOutput, "models.ts"))).toBe(true);
    expect(fs.existsSync(path.join(localOutput, "pets.service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(localOutput, "pets.types.ts"))).toBe(true);
  });

  it("throws on missing local file", async () => {
    await expect(
      generateApi("/nonexistent/path.json", path.join(tmpDir, "nope")),
    ).rejects.toThrow("file not found");
  });

  it("throws on invalid JSON file", async () => {
    const badFile = path.join(tmpDir, "bad.json");
    fs.writeFileSync(badFile, "{not valid json}");

    await expect(
      generateApi(badFile, path.join(tmpDir, "bad-out")),
    ).rejects.toThrow("Failed to parse OpenAPI spec");
  });

  it("handles spec with no components/schemas", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/hello": {
              get: {
                operationId: "sayHello",
                tags: ["greetings"],
                responses: {
                  "200": { description: "OK" },
                },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const noSchemaDir = path.join(tmpDir, "no-schemas");
    await generateApi("https://example.com/no-schemas.json", noSchemaDir);

    expect(fs.existsSync(path.join(noSchemaDir, "models.ts"))).toBe(true);
    expect(fs.existsSync(path.join(noSchemaDir, "greetings.service.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(noSchemaDir, "greetings.types.ts"))).toBe(
      true,
    );
  });

  it("dryRun returns endpoint count without writing files", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/a": {
              get: {
                tags: ["a"],
                operationId: "getA",
                responses: { "200": { description: "OK" } },
              },
            },
            "/b": {
              get: {
                tags: ["b"],
                operationId: "getB",
                responses: { "200": { description: "OK" } },
              },
            },
            "/c": {
              get: {
                tags: ["c"],
                operationId: "getC",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const dryDir = path.join(tmpDir, "dry-run-out");
    const count = await generateApi(
      "https://example.com/dry-test.json",
      dryDir,
      undefined,
      undefined,
      { dryRun: true },
    );

    expect(count).toBe(3);
    expect(fs.existsSync(dryDir)).toBe(false);
  });

  it("resolves nested $ref schemas across tags", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/orders": {
              get: {
                tags: ["orders"],
                operationId: "listOrders",
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Order" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "/items": {
              get: {
                tags: ["items"],
                operationId: "listItems",
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Item" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              Order: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string" },
                  item: { $ref: "#/components/schemas/Item" },
                },
              },
              Item: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const nestedDir = path.join(tmpDir, "nested");
    await generateApi("https://example.com/nested.json", nestedDir);

    // Item is used by both orders (via Order) and items tags → shared (models.ts)
    const modelsContent = fs.readFileSync(
      path.join(nestedDir, "models.ts"),
      "utf8",
    );
    expect(modelsContent).toContain("export const Item");

    const orderTypes = fs.readFileSync(
      path.join(nestedDir, "orders.types.ts"),
      "utf8",
    );
    expect(orderTypes).toContain("Item"); // shared ref imported
  });

  it("resolves nested $ref through wrapper schemas", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/users": {
              get: {
                tags: ["users"],
                operationId: "getUsers",
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ResponseBodyUser",
                        },
                      },
                    },
                  },
                },
              },
            },
            "/users/{id}": {
              get: {
                tags: ["users"],
                operationId: "getUser",
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ResponseBodyUser",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              ResponseBodyUser: {
                type: "object",
                properties: {
                  data: { $ref: "#/components/schemas/User" },
                },
              },
              User: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const wrapperDir = path.join(tmpDir, "wrapper");
    await generateApi("https://example.com/wrapper.json", wrapperDir);

    const usersTypes = fs.readFileSync(
      path.join(wrapperDir, "users.types.ts"),
      "utf8",
    );
    expect(usersTypes).toContain("User");
  });

  it("uses import alias in generated files", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/posts": {
              get: {
                tags: ["posts"],
                operationId: "listPosts",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const aliasDir = path.join(tmpDir, "alias");
    await generateApi("https://example.com/alias.json", aliasDir, "@/lib/api");

    const serviceContent = fs.readFileSync(
      path.join(aliasDir, "posts.service.ts"),
      "utf8",
    );
    expect(serviceContent).toContain('"@/lib/api/core/base-service"');
    expect(serviceContent).toContain('"@/lib/api/core/api-client"');

    const indexContent = fs.readFileSync(
      path.join(path.dirname(aliasDir), "index.ts"),
      "utf8",
    );
    expect(indexContent).toContain('"@/lib/api/core/api-client"');
  });

  it("generates with custom templates", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/notes": {
              get: {
                tags: ["notes"],
                operationId: "listNotes",
                responses: { "200": { description: "OK" } },
              },
              post: {
                tags: ["notes"],
                operationId: "createNote",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { text: { type: "string" } },
                      },
                    },
                  },
                },
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const customTplDir = path.join(tmpDir, "custom-templates");
    fs.mkdirSync(customTplDir, { recursive: true });

    // Write minimal templates with a recognizable marker
    fs.writeFileSync(
      path.join(customTplDir, "models.hbs"),
      `// CUSTOM-TPL models`,
    );
    fs.writeFileSync(
      path.join(customTplDir, "types.hbs"),
      `// CUSTOM-TPL {{tag}} types
{{#each specificSchemas}}
export const {{name}} = {};
{{/each}}
// --- CUSTOM CODE START ---
{{#if customCode}}{{{customCode}}}{{/if}}
// --- CUSTOM CODE END ---`,
    );
    fs.writeFileSync(
      path.join(customTplDir, "service.hbs"),
      `// CUSTOM-TPL {{className}} service
import { BaseService } from "{{corePath}}/base-service";
// --- CUSTOM CODE START ---
{{#if customCode}}{{{customCode}}}{{/if}}
// --- CUSTOM CODE END ---`,
    );
    fs.writeFileSync(
      path.join(customTplDir, "index.hbs"),
      `// CUSTOM-TPL index`,
    );
    fs.writeFileSync(
      path.join(customTplDir, "interceptors-index.hbs"),
      `// CUSTOM-TPL interceptors`,
    );

    const tplOut = path.join(tmpDir, "tpl-output");
    await generateApi(
      "https://example.com/tpl.json",
      tplOut,
      undefined,
      customTplDir,
    );

    const modelsContent = fs.readFileSync(
      path.join(tplOut, "models.ts"),
      "utf8",
    );
    expect(modelsContent).toContain("CUSTOM-TPL models");

    const typesContent = fs.readFileSync(
      path.join(tplOut, "notes.types.ts"),
      "utf8",
    );
    expect(typesContent).toContain("CUSTOM-TPL notes types");

    const serviceContent = fs.readFileSync(
      path.join(tplOut, "notes.service.ts"),
      "utf8",
    );
    expect(serviceContent).toContain("CUSTOM-TPL notesService service");

    const indexContent = fs.readFileSync(
      path.join(path.dirname(tplOut), "index.ts"),
      "utf8",
    );
    expect(indexContent).toContain("CUSTOM-TPL index");
  });

  it("preserves custom code markers on re-generation", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/widgets": {
              get: {
                tags: ["widgets"],
                operationId: "listWidgets",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const preserveDir = path.join(tmpDir, "preserve");
    await generateApi("https://example.com/preserve.json", preserveDir);

    const servicePath = path.join(preserveDir, "widgets.service.ts");
    const original = fs.readFileSync(servicePath, "utf8");

    // Inject custom code between markers
    const startMarker = "// --- CUSTOM CODE START ---";
    const endMarker = "// --- CUSTOM CODE END ---";
    const injected = original.replace(
      new RegExp(
        `(${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n)[\\s\\S]*?(\n\\s*${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      ),
      `$1  customMethod() { return true; }\n$2`,
    );
    fs.writeFileSync(servicePath, injected);

    // Re-generate
    await generateApi("https://example.com/preserve.json", preserveDir);

    const regenerated = fs.readFileSync(servicePath, "utf8");
    expect(regenerated).toContain("customMethod()");
    expect(regenerated).toContain("// --- CUSTOM CODE START ---");
    expect(regenerated).toContain("// --- CUSTOM CODE END ---");
  });

  it("handles integer, boolean, and enum schema types", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/items": {
              post: {
                tags: ["items"],
                operationId: "createItem",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          count: { type: "integer" },
                          active: { type: "boolean" },
                          status: { type: "string", enum: ["open", "closed"] },
                        },
                      },
                    },
                  },
                },
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const typesDir = path.join(tmpDir, "schema-types");
    await generateApi("https://example.com/schema-types.json", typesDir);

    const typesContent = fs.readFileSync(
      path.join(typesDir, "items.types.ts"),
      "utf8",
    );
    expect(typesContent).toContain("number");
    expect(typesContent).toContain("boolean");
    expect(typesContent).toContain('"open" | "closed"');
  });

  it("handles operation without operationId", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/health": {
              get: {
                tags: ["health"],
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const noOpIdDir = path.join(tmpDir, "no-opid");
    await generateApi("https://example.com/no-opid.json", noOpIdDir);

    const serviceContent = fs.readFileSync(
      path.join(noOpIdDir, "health.service.ts"),
      "utf8",
    );
    expect(serviceContent).toContain("unknownMethod");
  });

  it("handles operation without tags", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/untagged": {
              get: {
                operationId: "getUntagged",
                responses: { "200": { description: "OK" } },
              },
            },
            "/tagged": {
              get: {
                tags: ["items"],
                operationId: "getItems",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const noTagDir = path.join(tmpDir, "no-tag");
    await generateApi("https://example.com/no-tag.json", noTagDir);

    expect(fs.existsSync(path.join(noTagDir, "items.service.ts"))).toBe(true);
    // The untagged operation should be skipped — no service file for it
    const files = fs.readdirSync(noTagDir);
    expect(files.some((f) => f.includes("untagged"))).toBe(false);
  });

  it("handles operation with multiple tags", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/resource": {
              get: {
                tags: ["pets", "admin"],
                operationId: "getResource",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const multiTagDir = path.join(tmpDir, "multi-tag");
    await generateApi("https://example.com/multi-tag.json", multiTagDir);

    expect(fs.existsSync(path.join(multiTagDir, "pets.service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(multiTagDir, "admin.service.ts"))).toBe(
      false,
    );

    const svcContent = fs.readFileSync(
      path.join(multiTagDir, "pets.service.ts"),
      "utf8",
    );
    expect(svcContent).toContain("getResource");
  });

  it("handles network timeout error", async () => {
    const timeoutError = new Error("connect ETIMEDOUT");
    globalThis.fetch = (async () => {
      throw timeoutError;
    }) as typeof fetch;

    const timeoutDir = path.join(tmpDir, "timeout");
    await expect(
      generateApi("https://example.com/timeout.json", timeoutDir),
    ).rejects.toThrow("connect ETIMEDOUT");
  });

  it("handles non-JSON response body", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      }) as unknown as Response) as typeof fetch;

    const badJsonDir = path.join(tmpDir, "bad-json-resp");
    await expect(
      generateApi("https://example.com/bad-json.json", badJsonDir),
    ).rejects.toThrow();
  });

  it("handles interceptor auto-discovery", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/items": {
              get: {
                tags: ["items"],
                operationId: "listItems",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const provDir = path.join(tmpDir, "interceptor-prov");
    const interceptorsDir = path.join(provDir, "interceptors");
    fs.mkdirSync(interceptorsDir, { recursive: true });
    fs.writeFileSync(
      path.join(interceptorsDir, "custom.ts"),
      `export function installCustom(client: any) { return client; }\n`,
    );

    const svcDir = path.join(provDir, "services");
    await generateApi("https://example.com/interceptor.json", svcDir);

    const indexPath = path.join(interceptorsDir, "index.ts");
    expect(fs.existsSync(indexPath)).toBe(true);
    const indexContent = fs.readFileSync(indexPath, "utf8");
    expect(indexContent).toContain("installCustom");
  });

  it("handles missing interceptor directory", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/items": {
              get: {
                tags: ["items"],
                operationId: "listItems",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const noIntDir = path.join(tmpDir, "no-interceptors");
    await generateApi("https://example.com/no-int.json", noIntDir);

    expect(fs.existsSync(path.join(noIntDir, "items.service.ts"))).toBe(true);
    // The parent dir gets interceptors/ created by generateApi, but the
    // discovery loop handles empty/missing gracefully
    const parentDir = path.dirname(noIntDir);
    expect(
      fs.existsSync(path.join(parentDir, "interceptors", "index.ts")),
    ).toBe(true);
  });

  it("throws on missing template file", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/items": {
              get: {
                tags: ["items"],
                operationId: "listItems",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const emptyTplDir = path.join(tmpDir, "empty-templates");
    fs.mkdirSync(emptyTplDir, { recursive: true });

    const tplErrDir = path.join(tmpDir, "tpl-err-out");
    await expect(
      generateApi(
        "https://example.com/tpl-err.json",
        tplErrDir,
        undefined,
        emptyTplDir,
      ),
    ).rejects.toThrow(/Failed to compile template|ENOENT/);
  });

  it("handles path params with hyphens via toCamelCase", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/items/{item-id}": {
              get: {
                tags: ["items"],
                operationId: "getItem",
                parameters: [
                  {
                    name: "item-id",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                  },
                ],
                responses: { "200": { description: "OK" } },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const camelDir = path.join(tmpDir, "camel");
    await generateApi("https://example.com/camel.json", camelDir);

    const svcContent = fs.readFileSync(
      path.join(camelDir, "items.service.ts"),
      "utf8",
    );
    expect(svcContent).toContain("itemId");
    expect(svcContent).not.toContain("item-id");
  });

  it("handles spec with no schemas but ResponseBody wrapper", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          openapi: "3.0.0",
          paths: {
            "/foo": {
              get: {
                tags: ["foo"],
                operationId: "getFoo",
                responses: {
                  "200": {
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ResponseBodyFoo",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              ResponseBodyFoo: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        }),
      }) as Response) as typeof fetch;

    const wrapperDir = path.join(tmpDir, "no-data-wrapper");
    await generateApi("https://example.com/no-data.json", wrapperDir);

    const typesContent = fs.readFileSync(
      path.join(wrapperDir, "foo.types.ts"),
      "utf8",
    );
    expect(typesContent).toContain("ResponseBodyFoo");
  });
});
