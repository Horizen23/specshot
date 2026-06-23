import type { OpenApiSchema } from "../types/types";
import { faker } from "@faker-js/faker";
import { cleanRefName } from "../core/schema-parser";
import { getSchemaPropEntries } from "../core/schema-parser";

export function mockValueFromSchema(
  schema: OpenApiSchema | undefined,
  mockMode: "auto" | "faker" = "auto",
  schemas: Record<string, OpenApiSchema> = {},
  seen: Set<string> = new Set(),
  arraySize: number = 1,
  fakerArraySizes: Record<string, number> = {},
  path: string = 'root'
): string {
  if (!schema) return "null";

  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    if (mockMode === "faker") {
      if (seen.has(refName)) return "null";
      const schemaKey = Object.keys(schemas).find((k) => cleanRefName(k) === refName);
      if (schemaKey) {
        seen.add(refName);
        return mockValueFromSchema(schemas[schemaKey], mockMode, schemas, seen, arraySize, fakerArraySizes, path);
      }
    }
    return `{} as ${refName}`;
  }

  if (schema.type === "array") {
    if (schema.items) {
      if (schema.items.$ref && mockMode === "auto") {
        const refName = cleanRefName(schema.items.$ref);
        return `[] as ${refName}[]`;
      }
      const items = [];
      const size = mockMode === "faker" ? (fakerArraySizes[path] ?? fakerArraySizes['root'] ?? arraySize) : 1;
      for (let i = 0; i < size; i++) {
        const itemMock = mockValueFromSchema(schema.items, mockMode, schemas, new Set(seen), arraySize, fakerArraySizes, `${path}[]`);
        const indented = itemMock.split('\n').map(l => `  ${l}`).join('\n');
        items.push(indented);
      }
      return `[\n${items.join(',\n')}\n]`;
    }
    return "[]";
  }

  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema);
    if (props.length === 0) return "{}";
    const entries = props.map(({ safeKey, schema: ps }) => {
      const fieldPath = path === 'root' ? safeKey : `${path}.${safeKey}`;
      let value = mockValueFromSchema(ps, mockMode, schemas, new Set(seen), arraySize, fakerArraySizes, fieldPath);
      if (value.includes('\n')) {
        const lines = value.split('\n');
        value = lines[0] + '\n' + lines.slice(1).map(l => `  ${l}`).join('\n');
      }
      return `  ${safeKey}: ${value}`;
    });
    return `{\n${entries.join(",\n")}\n}`;
  }

  if (mockMode === "faker") {
    if (schema.type === "integer" || schema.type === "number") {
      if (schema.enum) return String(schema.enum[0]);
      return "faker.number.int({ min: 1, max: 1000 })";
    }
    if (schema.type === "string") {
      if (schema.enum) return `"${schema.enum[0]}"`;
      if (schema.format === "email") return "faker.internet.email()";
      if (schema.format === "uuid") return "faker.string.uuid()";
      if (schema.format === "date-time") return "faker.date.recent().toISOString()";
      if (schema.format === "url") return "faker.internet.url()";
      return "faker.lorem.word()";
    }
    if (schema.type === "boolean") return "faker.datatype.boolean()";
  }

  if (schema.type === "integer" || schema.type === "number") {
    if (schema.enum) return String(schema.enum[0]);
    return "0";
  }

  if (schema.type === "string") {
    if (schema.enum) return `"${schema.enum[0]}"`;
    return '"mock_string"';
  }

  if (schema.type === "boolean") return "false";

  return "null";
}

export function mockJsonFromSchema(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
  seen: Set<string> = new Set(),
  mockMode: "auto" | "faker" = "auto",
  arraySize: number = 1,
  fakerArraySizes: Record<string, number> = {},
  path: string = 'root'
): string {
  if (!schema) return "null";

  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    if (seen.has(refName)) return "null";
    const schemaKey = Object.keys(schemas).find(
      (k) => cleanRefName(k) === refName,
    );
    if (schemaKey) {
      if (mockMode !== "faker") seen.add(refName);
      return mockJsonFromSchema(schemas[schemaKey], schemas, seen, mockMode, arraySize, fakerArraySizes, path);
    }
    return `{} // TODO: ${refName}`;
  }

  if (schema.type === "array") {
    if (schema.items) {
      const items = [];
      const size = mockMode === "faker" ? (fakerArraySizes[path] ?? (path === 'root' ? (fakerArraySizes['root'] ?? arraySize) : arraySize)) : 1;
      for (let i = 0; i < size; i++) {
        const itemMock = mockJsonFromSchema(schema.items, schemas, new Set(seen), mockMode, arraySize, fakerArraySizes, `${path}[]`);
        const indented = itemMock.split('\n').map(l => `  ${l}`).join('\n');
        items.push(indented);
      }
      return `[\n${items.join(',\n')}\n]`;
    }
    return "[]";
  }

  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema);
    if (props.length === 0) return "{}";
    const entries = props.map(({ safeKey, schema: ps }) => {
      const fieldPath = path === 'root' ? safeKey.replace(/^"|"$/g, "") : `${path}.${safeKey.replace(/^"|"$/g, "")}`;
      let value = mockJsonFromSchema(ps, schemas, new Set(seen), mockMode, arraySize, fakerArraySizes, fieldPath);
      if (value.includes('\n')) {
        const lines = value.split('\n');
        value = lines[0] + '\n' + lines.slice(1).map(l => `  ${l}`).join('\n');
      }
      return `  "${safeKey.replace(/^"|"$/g, "")}": ${value}`;
    });
    return `{\n${entries.join(",\n")}\n}`;
  }

  if (mockMode === "faker") {
    if (schema.type === "integer" || schema.type === "number") {
      if (schema.enum) return String(schema.enum[0]);
      return String(faker.number.int({ min: 1, max: 1000 }));
    }
    if (schema.type === "string") {
      if (schema.enum) return `"${schema.enum[0]}"`;
      if (schema.format === "email") return `"${faker.internet.email()}"`;
      if (schema.format === "uuid") return `"${faker.string.uuid()}"`;
      if (schema.format === "date-time") return `"${faker.date.recent().toISOString()}"`;
      if (schema.format === "url") return `"${faker.internet.url()}"`;
      return `"${faker.lorem.word()}"`;
    }
    if (schema.type === "boolean") return String(faker.datatype.boolean());
  }

  if (schema.type === "integer" || schema.type === "number") {
    if (schema.enum) return String(schema.enum[0]);
    return "0";
  }

  if (schema.type === "string") {
    if (schema.enum) return `"${schema.enum[0]}"`;
    return '"string"';
  }

  if (schema.type === "boolean") return "false";

  return "null";
}
