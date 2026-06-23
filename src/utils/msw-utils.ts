import type { OpenApiSchema } from "../types/types";
import { faker } from "@faker-js/faker";
import { cleanRefName } from "../core/schema-parser";
import { getSchemaPropEntries } from "../core/schema-parser";

// Workaround for E2E tests: when vitest runs, it sets process.env.VITEST,
// which is inherited by spawned CLI child processes. However, the CLI entrypoint
// exits early if process.env.VITEST is set to prevent auto-execution during unit tests.
// By deleting process.env.VITEST when we detect we are in the spawned CLI process,
// we allow the CLI to execute correctly during E2E test runs.
if (
  process.env.VITEST &&
  process.argv[1] &&
  (process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("specshot") ||
    process.argv[1].includes("dist/cli.js"))
) {
  delete process.env.VITEST;
}

export interface TraversalContext {
  path: string;
  seen: Set<string>;
}

export interface TraverseSchemaOptions {
  schemas?: Record<string, OpenApiSchema>;
  arraySize?: number;
  fakerArraySizes?: Record<string, number>;
  fakerFormats?: Record<string, string>;
  mockMode?: "auto" | "faker";
  shouldTrackRef?: (refName: string, context: TraversalContext) => boolean;
}

export interface TraverseSchemaCallbacks<T> {
  onEnter?: (schema: OpenApiSchema, context: TraversalContext) => void;
  onUndefined?: (context: TraversalContext) => T;
  onRef: (refName: string, isCycle: boolean, context: TraversalContext) => T;
  onArray: (schema: OpenApiSchema, items: T[], context: TraversalContext) => T;
  onObject: (
    schema: OpenApiSchema,
    properties: {
      safeKey: string;
      value: T;
      fieldPath: string;
      schema: OpenApiSchema;
    }[],
    context: TraversalContext,
  ) => T;
  onPrimitive: (schema: OpenApiSchema, context: TraversalContext) => T;
}

export function traverseSchema<T>(
  schema: OpenApiSchema | undefined,
  options: TraverseSchemaOptions,
  callbacks: TraverseSchemaCallbacks<T>,
  context: TraversalContext = { path: "root", seen: new Set() },
): T {
  const { schemas = {}, mockMode = "auto", shouldTrackRef } = options;
  const { path, seen } = context;

  if (!schema) {
    if (callbacks.onUndefined) {
      return callbacks.onUndefined(context);
    }
    return "null" as unknown as T;
  }

  // 1. Reference Resolution & Cycle Detection
  if (schema.$ref) {
    const refName = cleanRefName(schema.$ref);
    if (seen.has(refName)) {
      return callbacks.onRef(refName, true, context);
    }
    const schemaKey = Object.keys(schemas).find(
      (k) => cleanRefName(k) === refName,
    );
    if (schemaKey) {
      const track = shouldTrackRef
        ? shouldTrackRef(refName, context)
        : mockMode !== "faker";
      if (track) {
        seen.add(refName);
      }
      return traverseSchema(schemas[schemaKey], options, callbacks, context);
    }
    return callbacks.onRef(refName, false, context);
  }

  // Preorder traversal hook
  if (callbacks.onEnter) {
    callbacks.onEnter(schema, context);
  }

  // 2. Array Traversal
  if (schema.type === "array") {
    if (schema.items) {
      const arraySize = options.arraySize ?? 1;
      const fakerArraySizes = options.fakerArraySizes ?? {};
      const size =
        mockMode === "faker"
          ? (fakerArraySizes[path] ??
            (path === "root"
              ? (fakerArraySizes["root"] ?? arraySize)
              : arraySize))
          : 1;

      const items: T[] = [];
      for (let i = 0; i < size; i++) {
        const item = traverseSchema(schema.items, options, callbacks, {
          path: `${path}[]`,
          seen: new Set(seen),
        });
        items.push(item);
      }
      return callbacks.onArray(schema, items, context);
    }
    return callbacks.onArray(schema, [], context);
  }

  // 3. Object Traversal
  if (schema.type === "object" || schema.properties) {
    const props = getSchemaPropEntries(schema);
    if (props.length === 0) {
      return callbacks.onObject(schema, [], context);
    }
    const properties = props.map(({ safeKey, schema: ps }) => {
      const fieldPath =
        path === "root"
          ? safeKey.replace(/^"|"$/g, "")
          : `${path}.${safeKey.replace(/^"|"$/g, "")}`;
      const value = traverseSchema(ps, options, callbacks, {
        path: fieldPath,
        seen: new Set(seen),
      });
      return { safeKey, value, fieldPath, schema: ps };
    });
    return callbacks.onObject(schema, properties, context);
  }

  // 4. Primitive / Leaf node
  return callbacks.onPrimitive(schema, context);
}

export function mockValueFromSchema(
  schema: OpenApiSchema | undefined,
  mockMode: "auto" | "faker" = "auto",
  schemas: Record<string, OpenApiSchema> = {},
  seen: Set<string> = new Set(),
  arraySize: number = 1,
  fakerArraySizes: Record<string, number> = {},
  path: string = "root",
  fakerFormats: Record<string, string> = {},
): string {
  const options: TraverseSchemaOptions = {
    schemas,
    mockMode,
    arraySize,
    fakerArraySizes,
    fakerFormats,
  };

  const callbacks: TraverseSchemaCallbacks<string> = {
    onUndefined: () => "null",
    onRef: (refName, isCycle) => {
      if (isCycle) return "null";
      return `{} /* TODO: ${refName} */`;
    },
    onArray: (schema, items) => {
      if (items.length === 0) return "[]";
      const formattedItems = items.map((item) =>
        item
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      );
      return `[\n${formattedItems.join(",\n")}\n]`;
    },
    onObject: (schema, properties) => {
      if (properties.length === 0) return "{}";
      const entries = properties.map(({ safeKey, value }) => {
        let formattedValue = value;
        if (value.includes("\n")) {
          const lines = value.split("\n");
          formattedValue =
            lines[0] +
            "\n" +
            lines
              .slice(1)
              .map((l) => `  ${l}`)
              .join("\n");
        }
        return `  ${safeKey}: ${formattedValue}`;
      });
      return `{\n${entries.join(",\n")}\n}`;
    },
    onPrimitive: (schema, context) => {
      const currentPath = context.path;

      if (mockMode === "faker") {
        const customFormat = fakerFormats[currentPath];
        if (customFormat) {
          return `faker.${customFormat}()`;
        }

        if (schema.type === "integer" || schema.type === "number") {
          if (schema.enum) return String(schema.enum[0]);
          return "faker.number.int({ min: 1, max: 1000 })";
        }
        if (schema.type === "string") {
          if (schema.enum) return `"${schema.enum[0]}"`;
          if (schema.format === "email") return "faker.internet.email()";
          if (schema.format === "uuid") return "faker.string.uuid()";
          if (schema.format === "date-time")
            return "faker.date.recent().toISOString()";
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
    },
  };

  return traverseSchema(schema, options, callbacks, { path, seen });
}

export function mockJsonFromSchema(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
  seen: Set<string> = new Set(),
  mockMode: "auto" | "faker" = "auto",
  arraySize: number = 1,
  fakerArraySizes: Record<string, number> = {},
  path: string = "root",
  fakerFormats: Record<string, string> = {},
): string {
  const options: TraverseSchemaOptions = {
    schemas,
    mockMode,
    arraySize,
    fakerArraySizes,
    fakerFormats,
  };

  const callbacks: TraverseSchemaCallbacks<string> = {
    onUndefined: () => "null",
    onRef: (refName, isCycle) => {
      if (isCycle) return "null";
      return `{} // TODO: ${refName}`;
    },
    onArray: (schema, items) => {
      if (items.length === 0) return "[]";
      const formattedItems = items.map((item) =>
        item
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
      );
      return `[\n${formattedItems.join(",\n")}\n]`;
    },
    onObject: (schema, properties) => {
      if (properties.length === 0) return "{}";
      const entries = properties.map(({ safeKey, value }) => {
        let formattedValue = value;
        if (value.includes("\n")) {
          const lines = value.split("\n");
          formattedValue =
            lines[0] +
            "\n" +
            lines
              .slice(1)
              .map((l) => `  ${l}`)
              .join("\n");
        }
        return `  "${safeKey.replace(/^"|"$/g, "")}": ${formattedValue}`;
      });
      return `{\n${entries.join(",\n")}\n}`;
    },
    onPrimitive: (schema, context) => {
      const currentPath = context.path;

      if (mockMode === "faker") {
        const customFormat = fakerFormats[currentPath];
        if (customFormat) {
          try {
            const parts = customFormat.split(".");
            if (parts.length === 2) {
              const ns = parts[0] as keyof typeof faker;
              const fn = parts[1];
              const fakerNs = faker[ns];
              if (
                fakerNs &&
                typeof fakerNs === "object" &&
                fn in fakerNs &&
                typeof (fakerNs as Record<string, unknown>)[fn] === "function"
              ) {
                const val = (fakerNs as Record<string, () => unknown>)[fn]();
                if (typeof val === "string") return `"${val}"`;
                if (val instanceof Date) return `"${val.toISOString()}"`;
                return String(val);
              }
            }
          } catch (_e) {}
        }

        if (schema.type === "integer" || schema.type === "number") {
          if (schema.enum) return String(schema.enum[0]);
          return String(faker.number.int({ min: 1, max: 1000 }));
        }
        if (schema.type === "string") {
          if (schema.enum) return `"${schema.enum[0]}"`;
          if (schema.format === "email") return `"${faker.internet.email()}"`;
          if (schema.format === "uuid") return `"${faker.string.uuid()}"`;
          if (schema.format === "date-time")
            return `"${faker.date.recent().toISOString()}"`;
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
    },
  };

  return traverseSchema(schema, options, callbacks, { path, seen });
}

export function getSchemaTypes(
  schema: OpenApiSchema | undefined,
  schemas: Record<string, OpenApiSchema>,
  seen: Set<string> = new Set(),
  path: string = "root",
  types: Record<string, string> = {},
): Record<string, string> {
  const options: TraverseSchemaOptions = {
    schemas,
    shouldTrackRef: () => true,
  };

  const callbacks: TraverseSchemaCallbacks<void> = {
    onEnter: (schema, context) => {
      if (schema.type) {
        types[context.path] = schema.type;
      }
    },
    onUndefined: () => {},
    onRef: () => {},
    onArray: () => {},
    onObject: () => {},
    onPrimitive: () => {},
  };

  traverseSchema(schema, options, callbacks, { path, seen });
  return types;
}
