import type { OpenApiSchema } from "../types/types";
import { cleanRefName } from "../core/schema-parser";
import { getSchemaPropEntries } from "../core/schema-parser";

export function mockValueFromSchema(schema: OpenApiSchema | undefined): string {
  if (!schema) return "null";

  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    return `{} as ${refName}`;
  }

  if (schema.type === "array") {
    if (schema.items) {
      if (schema.items.$ref) {
        const refName = cleanRefName(schema.items.$ref);
        return `[] as ${refName}[]`;
      }
      const itemMock = mockValueFromSchema(schema.items);
      return `[${itemMock}]`;
    }
    return "[]";
  }

  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema);
    if (props.length === 0) return "{}";
    const entries = props.map(({ safeKey, schema: ps }) => {
      const value = mockValueFromSchema(ps);
      return `  ${safeKey}: ${value}`;
    });
    return `{\n${entries.join(",\n")}\n}`;
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
): string {
  if (!schema) return "null";

  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    if (seen.has(refName)) return "null";
    const schemaKey = Object.keys(schemas).find(
      (k) => cleanRefName(k) === refName,
    );
    if (schemaKey) {
      seen.add(refName);
      return mockJsonFromSchema(schemas[schemaKey], schemas, seen);
    }
    return `{} // TODO: ${refName}`;
  }

  if (schema.type === "array") {
    if (schema.items) {
      const itemMock = mockJsonFromSchema(schema.items, schemas, new Set(seen));
      const indented = itemMock.split('\n').map(l => `  ${l}`).join('\n');
      return `[\n${indented}\n]`;
    }
    return "[]";
  }

  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema);
    if (props.length === 0) return "{}";
    const entries = props.map(({ safeKey, schema: ps }) => {
      let value = mockJsonFromSchema(ps, schemas, new Set(seen));
      if (value.includes('\n')) {
        const lines = value.split('\n');
        value = lines[0] + '\n' + lines.slice(1).map(l => `  ${l}`).join('\n');
      }
      return `  "${safeKey.replace(/^"|"$/g, "")}": ${value}`;
    });
    return `{\n${entries.join(",\n")}\n}`;
  }

  if (schema.type === "integer") {
    if (schema.enum) return String(schema.enum[0]);
    return "0";
  }
  if (schema.type === "number") {
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
