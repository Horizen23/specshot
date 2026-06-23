import type { OpenApiSchema } from "../types/types";
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
