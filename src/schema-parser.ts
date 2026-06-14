import { RESPONSE_BODY_STRUCT } from "./constants";
import type { OpenApiSchema, PropEntry } from "./types";

export function cleanRefName(ref: string | undefined): string {
  if (!ref) return "";
  return ref
    .split("/")
    .pop()!
    .replace(/[^a-zA-Z0-9_]/g, "");
}

export function extractRefs(
  schema: OpenApiSchema | undefined,
  refs: Set<string> = new Set(),
): Set<string> {
  if (!schema) return refs;
  if (schema.$ref) refs.add(cleanRefName(schema.$ref));
  if (schema.type === "array" && schema.items) extractRefs(schema.items, refs);
  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      extractRefs(prop, refs);
    }
  }
  return refs;
}

export function getSchemaPropEntries(schema: OpenApiSchema): PropEntry[] {
  const required = schema.required || [];
  return Object.entries(schema.properties || {}).map(([key, propSchema]) => ({
    key,
    safeKey: key.includes("-") || key.includes(" ") ? `"${key}"` : key,
    isRequired: required.includes(key),
    schema: propSchema,
  }));
}

export function schemaToTsType(schema: OpenApiSchema | undefined): string {
  if (!schema) return "any";
  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    if (refName === RESPONSE_BODY_STRUCT) return "void";
    return refName;
  }

  if (schema.type === "array") {
    return `${schemaToTsType(schema.items)}[]`;
  }

  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema).map(
      ({ safeKey, isRequired, schema: ps }) =>
        `  ${safeKey}${isRequired ? "" : "?"}: ${schemaToTsType(ps)};`,
    );
    if (props.length === 0) return "Record<string, any>";
    return `{\n${props.join("\n")}\n}`;
  }

  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "string") {
    if (schema.enum)
      return schema.enum
        .map((e) => (typeof e === "number" ? String(e) : `"${e}"`))
        .join(" | ");
    return "string";
  }
  if (schema.type === "number" && schema.enum) {
    return schema.enum.map((e) => String(e)).join(" | ");
  }
  if (schema.type === "boolean") return "boolean";

  return "any";
}

export function schemaToZod(schema: OpenApiSchema | undefined): string {
  if (!schema) return "z.any()";
  if (schema.$ref) {
    return `${cleanRefName(schema.$ref)}Schema`;
  }
  if (schema.type === "array") {
    return `z.array(${schemaToZod(schema.items)})`;
  }
  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema).map(
      ({ safeKey, isRequired, schema: ps }) => {
        let zodType = schemaToZod(ps);
        if (!isRequired) zodType += ".optional()";
        return `  ${safeKey}: ${zodType},`;
      },
    );
    if (props.length === 0) return "z.record(z.any())";
    return `z.object({\n${props.join("\n")}\n})`;
  }
  if (schema.type === "integer" || schema.type === "number")
    return "z.number()";
  if (schema.type === "string") {
    if (schema.enum) {
      if (schema.enum.every((e) => typeof e === "string")) {
        return `z.enum([${schema.enum.map((e) => `"${e}"`).join(", ")}])`;
      }
      return `z.union([${schema.enum.map((e) => `z.literal(${typeof e === "number" ? e : `"${e}"`})`).join(", ")}])`;
    }
    return "z.string()";
  }
  if (schema.type === "number" && schema.enum) {
    return `z.union([${schema.enum.map((e) => `z.literal(${e})`).join(", ")}])`;
  }
  if (schema.type === "boolean") return "z.boolean()";

  return "z.any()";
}
