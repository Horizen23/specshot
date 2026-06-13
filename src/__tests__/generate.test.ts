import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { generateApi } from "../generate.js";

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
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ openapi: "3.0.0", paths: {} }),
    } as Response)) as typeof fetch;

    const emptyDir = path.join(tmpDir, "empty");
    await expect(generateApi("https://example.com/empty.json", emptyDir)).rejects.toThrow(
      "has no endpoints",
    );
  });

  it("handles 404 fetch error", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    } as Response)) as typeof fetch;

    await expect(
      generateApi("https://example.com/notfound.json", outputDir),
    ).rejects.toThrow("not found");
  });
});
