import { RESPONSE_BODY_STRUCT, RESPONSE_BODY_PREFIX, JSON_CONTENT_TYPE, HTTP_OK } from "../types/constants";
import type { OpenApiSchema, PropEntry, OpenApiSpec } from "../types/types";

/**
 * Analyse which tags reference which component schemas across all operations,
 * then decide whether each schema belongs to a single tag (tag-local) or
 * multiple tags (shared / global models).
 *
 * @returns
 *   - `sharedSchemas` — schema names that appear in ≥2 tags → go in `models.ts`
 *   - `tagSchemas`    — map of tag → set of schema names owned exclusively by it
 */
export function resolveSchemaOwnership(
  spec: OpenApiSpec,
): {
  sharedSchemas: Set<string>;
  tagSchemas: Map<string, Set<string>>;
} {
  const schemas = spec.components?.schemas || {};

  // Seed usage map
  const schemaUsage = new Map<string, Set<string>>();
  for (const name of Object.keys(schemas)) {
    schemaUsage.set(cleanRefName(name), new Set<string>());
  }

  // Walk every operation, collect which tags reference which schema refs
  const pathEntries = Object.entries(spec.paths ?? {}) as [
    string,
    Record<string, { tags?: string[]; requestBody?: any; responses?: any; parameters?: any[] }>,
  ][];
  for (const [, methods] of pathEntries) {
    for (const operation of Object.values(methods)) {
      if (!operation.tags || operation.tags.length === 0) continue;
      const tag = operation.tags[0];

      const refsInOp = new Set<string>();
      if (operation.requestBody?.content?.[JSON_CONTENT_TYPE]?.schema) {
        extractRefs(operation.requestBody.content[JSON_CONTENT_TYPE].schema, refsInOp);
      }
      if (operation.responses?.[HTTP_OK]?.content?.[JSON_CONTENT_TYPE]?.schema) {
        extractRefs(operation.responses[HTTP_OK].content[JSON_CONTENT_TYPE].schema, refsInOp);
      }
      for (const ref of refsInOp) {
        if (schemaUsage.has(ref)) schemaUsage.get(ref)!.add(tag);
      }
    }
  }

  // Propagate usage to nested schemas (BFS-style fixed-point)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, schema] of Object.entries(schemas)) {
      const cleanName = cleanRefName(name);
      if (cleanName === RESPONSE_BODY_STRUCT) continue;
      const nestedRefs = extractRefs(schema);
      const parentTags = schemaUsage.get(cleanName) || new Set<string>();
      for (const nestedRef of nestedRefs) {
        const childTags = schemaUsage.get(nestedRef);
        if (childTags) {
          const sizeBefore = childTags.size;
          for (const t of parentTags) childTags.add(t);
          if (childTags.size > sizeBefore) changed = true;
        }
      }
    }
  }

  // Partition into shared vs. tag-local
  const sharedSchemas = new Set<string>();
  const tagSchemas = new Map<string, Set<string>>();

  for (const [name, tags] of schemaUsage.entries()) {
    if (name === RESPONSE_BODY_STRUCT || name.startsWith(RESPONSE_BODY_PREFIX)) continue;
    if (tags.size === 1) {
      const tag = Array.from(tags)[0];
      if (!tagSchemas.has(tag)) tagSchemas.set(tag, new Set<string>());
      tagSchemas.get(tag)!.add(name);
    } else {
      sharedSchemas.add(name);
    }
  }

  return { sharedSchemas, tagSchemas };
}


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
