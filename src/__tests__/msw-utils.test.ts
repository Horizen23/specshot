import { describe, it, expect } from "vitest";
import {
  mockValueFromSchema,
  mockJsonFromSchema,
  getSchemaTypes,
} from "../utils/msw-utils";
import type { OpenApiSchema } from "../types/types";

describe("msw-utils unit tests", () => {
  describe("mockValueFromSchema", () => {
    it("handles primitives in auto mode", () => {
      expect(mockValueFromSchema({ type: "string" })).toBe('"mock_string"');
      expect(mockValueFromSchema({ type: "integer" })).toBe("0");
      expect(mockValueFromSchema({ type: "number" })).toBe("0");
      expect(mockValueFromSchema({ type: "boolean" })).toBe("false");
      expect(mockValueFromSchema(undefined)).toBe("null");
    });

    it("handles enums", () => {
      expect(
        mockValueFromSchema({ type: "string", enum: ["admin", "user"] }),
      ).toBe('"admin"');
      expect(mockValueFromSchema({ type: "integer", enum: [42, 100] })).toBe(
        "42",
      );
    });

    it("handles objects", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
        },
      };
      const result = mockValueFromSchema(schema);
      expect(result).toContain("id: 0");
      expect(result).toContain('name: "mock_string"');
      expect(result).toBe('{\n  id: 0,\n  name: "mock_string"\n}');
    });

    it("handles nested objects formatting", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              email: { type: "string" },
            },
          },
        },
      };
      const result = mockValueFromSchema(schema);
      expect(result).toBe('{\n  user: {\n    email: "mock_string"\n  }\n}');
    });

    it("handles arrays", () => {
      const schema: OpenApiSchema = {
        type: "array",
        items: { type: "string" },
      };
      const result = mockValueFromSchema(schema);
      expect(result).toBe('[\n  "mock_string"\n]');
    });

    it("handles empty arrays and objects", () => {
      expect(mockValueFromSchema({ type: "array" })).toBe("[]");
      expect(mockValueFromSchema({ type: "object", properties: {} })).toBe(
        "{}",
      );
    });

    it("handles faker mode primitives", () => {
      const schemaStr = mockValueFromSchema({ type: "string" }, "faker");
      expect(schemaStr).toBe("faker.lorem.word()");

      const schemaInt = mockValueFromSchema({ type: "integer" }, "faker");
      expect(schemaInt).toBe("faker.number.int({ min: 1, max: 1000 })");

      const schemaBool = mockValueFromSchema({ type: "boolean" }, "faker");
      expect(schemaBool).toBe("faker.datatype.boolean()");
    });

    it("handles faker format overrides", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          uuid: { type: "string", format: "uuid" },
          updatedAt: { type: "string", format: "date-time" },
          website: { type: "string", format: "url" },
        },
      };
      const result = mockValueFromSchema(schema, "faker");
      expect(result).toContain("email: faker.internet.email()");
      expect(result).toContain("uuid: faker.string.uuid()");
      expect(result).toContain("updatedAt: faker.date.recent().toISOString()");
      expect(result).toContain("website: faker.internet.url()");
    });

    it("handles custom faker formats", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          userEmail: { type: "string" },
        },
      };
      const result = mockValueFromSchema(
        schema,
        "faker",
        {},
        new Set(),
        1,
        {},
        "root",
        { userEmail: "internet.email" },
      );
      expect(result).toContain("userEmail: faker.internet.email()");
    });

    it("resolves references and detects cycles", () => {
      const schemas: Record<string, OpenApiSchema> = {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            friend: { $ref: "#/components/schemas/User" },
          },
        },
      };

      const result = mockValueFromSchema(
        { $ref: "#/components/schemas/User" },
        "auto",
        schemas,
      );

      // Should output the User details once, but friend should be null due to cycle detection
      expect(result).toContain("id: 0");
      expect(result).toContain("friend: null");
    });
  });

  describe("mockJsonFromSchema", () => {
    it("handles primitives in auto mode", () => {
      expect(mockJsonFromSchema({ type: "string" }, {})).toBe('"string"');
      expect(mockJsonFromSchema({ type: "integer" }, {})).toBe("0");
      expect(mockJsonFromSchema({ type: "boolean" }, {})).toBe("false");
    });

    it("handles objects in auto mode", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          id: { type: "integer" },
          "user-name": { type: "string" },
        },
      };
      const result = mockJsonFromSchema(schema, {});
      expect(result).toBe('{\n  "id": 0,\n  "user-name": "string"\n}');
    });

    it("handles faker mode primitives and evaluates them", () => {
      const emailVal = mockJsonFromSchema(
        { type: "string", format: "email" },
        {},
        new Set(),
        "faker",
      );
      expect(emailVal).toMatch(/^".+@.+\..+"$/);

      const intVal = mockJsonFromSchema(
        { type: "integer" },
        {},
        new Set(),
        "faker",
      );
      const num = parseInt(intVal, 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(1000);

      const boolVal = mockJsonFromSchema(
        { type: "boolean" },
        {},
        new Set(),
        "faker",
      );
      expect(["true", "false"]).toContain(boolVal);
    });

    it("handles custom faker format evaluation", () => {
      const result = mockJsonFromSchema(
        { type: "string" },
        {},
        new Set(),
        "faker",
        1,
        {},
        "root",
        { root: "internet.email" },
      );
      expect(result).toMatch(/^".+@.+\..+"$/);
    });

    it("handles arrays with sizes in faker mode", () => {
      const schema: OpenApiSchema = {
        type: "array",
        items: { type: "integer" },
      };
      const result = mockJsonFromSchema(
        schema,
        {},
        new Set(),
        "faker",
        3,
        { root: 4 }, // path is root since array is top level
      );
      const arr = JSON.parse(result);
      expect(arr.length).toBe(4);
      expect(typeof arr[0]).toBe("number");
    });
  });

  describe("getSchemaTypes", () => {
    it("extracts schema types mapping", () => {
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          id: { type: "integer" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          profile: {
            type: "object",
            properties: {
              active: { type: "boolean" },
            },
          },
        },
      };
      const types = getSchemaTypes(schema, {});
      expect(types).toEqual({
        root: "object",
        id: "integer",
        tags: "array",
        "tags[]": "string",
        profile: "object",
        "profile.active": "boolean",
      });
    });

    it("handles references in getSchemaTypes", () => {
      const schemas: Record<string, OpenApiSchema> = {
        Address: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
        },
      };
      const schema: OpenApiSchema = {
        type: "object",
        properties: {
          address: { $ref: "#/components/schemas/Address" },
        },
      };
      const types = getSchemaTypes(schema, schemas);
      expect(types).toEqual({
        root: "object",
        address: "object",
        "address.city": "string",
      });
    });
  });
});
