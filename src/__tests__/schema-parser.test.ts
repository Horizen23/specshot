import { describe, it, expect } from "vitest";
import { resolveSchemaOwnership } from "../core/schema-parser";
import type { OpenApiSpec } from "../types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(
  schemas: Record<string, object>,
  paths: OpenApiSpec["paths"],
): OpenApiSpec {
  return {
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths,
    components: { schemas: schemas as OpenApiSpec["components"]["schemas"] },
  } as OpenApiSpec;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveSchemaOwnership", () => {
  it("schema used by one tag → goes to tagSchemas", () => {
    const spec = makeSpec(
      {
        Pet: { type: "object", properties: { id: { type: "integer" } } },
      },
      {
        "/pets": {
          get: {
            tags: ["pets"],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Pet" },
                  },
                },
              },
            },
          },
        },
      },
    );

    const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

    expect(sharedSchemas.has("Pet")).toBe(false);
    expect(tagSchemas.get("pets")?.has("Pet")).toBe(true);
  });

  it("schema used by multiple tags → goes to sharedSchemas", () => {
    const spec = makeSpec(
      {
        ErrorBody: { type: "object", properties: { message: { type: "string" } } },
      },
      {
        "/pets": {
          get: {
            tags: ["pets"],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorBody" },
                  },
                },
              },
            },
          },
        },
        "/users": {
          get: {
            tags: ["users"],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorBody" },
                  },
                },
              },
            },
          },
        },
      },
    );

    const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

    expect(sharedSchemas.has("ErrorBody")).toBe(true);
    // Must NOT appear in any tag bucket
    for (const set of tagSchemas.values()) {
      expect(set.has("ErrorBody")).toBe(false);
    }
  });

  it("ResponseBodyStruct is excluded from both sharedSchemas and tagSchemas", () => {
    const spec = makeSpec(
      {
        // RESPONSE_BODY_STRUCT constant value is "ResponseBodyStruct"
        ResponseBodyStruct: {
          type: "object",
          properties: { data: { type: "string" } },
        },
      },
      {
        "/items": {
          get: {
            tags: ["items"],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ResponseBodyStruct" },
                  },
                },
              },
            },
          },
        },
      },
    );

    const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

    expect(sharedSchemas.has("ResponseBodyStruct")).toBe(false);
    for (const set of tagSchemas.values()) {
      expect(set.has("ResponseBodyStruct")).toBe(false);
    }
  });

  it("nested $ref propagates usage to child schema", () => {
    // Parent is referenced by "orders" tag, which should propagate to Child
    const spec = makeSpec(
      {
        OrderDetail: {
          type: "object",
          properties: {
            item: { $ref: "#/components/schemas/OrderItem" },
          },
        },
        OrderItem: {
          type: "object",
          properties: { sku: { type: "string" } },
        },
      },
      {
        "/orders": {
          post: {
            tags: ["orders"],
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OrderDetail" },
                },
              },
            },
            responses: {},
          },
        },
      },
    );

    const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

    // Both parent and nested child should be owned exclusively by "orders"
    expect(sharedSchemas.has("OrderDetail")).toBe(false);
    expect(sharedSchemas.has("OrderItem")).toBe(false);
    expect(tagSchemas.get("orders")?.has("OrderDetail")).toBe(true);
    expect(tagSchemas.get("orders")?.has("OrderItem")).toBe(true);
  });
});
