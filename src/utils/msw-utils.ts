import type { OpenApiSchema } from "../types/types";
import { faker } from "@faker-js/faker";
import {
  traverseSchema,
  type TraversalContext,
  type TraverseSchemaOptions,
  type TraverseSchemaCallbacks,
} from "./schema-traversal";
import type { SpecshotPlugin } from "../core/config-loader";

export type {
  TraversalContext,
  TraverseSchemaOptions,
  TraverseSchemaCallbacks,
};
export { traverseSchema };

export function mockValueFromSchema(
  schema: OpenApiSchema | undefined,
  mockMode: "auto" | "faker" = "auto",
  schemas: Record<string, OpenApiSchema> = {},
  seen: Set<string> = new Set(),
  arraySize: number = 1,
  fakerArraySizes: Record<string, number> = {},
  path: string = "root",
  fakerFormats: Record<string, string> = {},
  plugins: SpecshotPlugin[] = [],
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
        for (const plugin of plugins) {
          try {
            const pluginContext = { path: currentPath, schema };
            if (plugin.match(pluginContext)) {
              const val = plugin.generate(faker, pluginContext);
              if (typeof val === "string") {
                if (val.startsWith("faker.")) return val;
                return `"${val}"`;
              }
              if (val instanceof Date) return `"${val.toISOString()}"`;
              return String(val);
            }
          } catch (err) {
            console.error(`\n[Specshot] Plugin "${plugin.name}" error:`, err);
          }
        }

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
  plugins: SpecshotPlugin[] = [],
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
        // 1. Run plugins first
        for (const plugin of plugins) {
          try {
            const pluginContext = { path: currentPath, schema };
            if (plugin.match(pluginContext)) {
              const val = plugin.generate(faker, pluginContext);
              if (typeof val === "string") return `"${val}"`;
              if (val instanceof Date) return `"${val.toISOString()}"`;
              return String(val);
            }
          } catch (err) {
            console.error(`\n[Specshot] Plugin "${plugin.name}" error:`, err);
          }
        }

        // 2. Custom format from UI config
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
                typeof (fakerNs as unknown as Record<string, unknown>)[fn] === "function"
              ) {
                const val = (fakerNs as unknown as Record<string, () => unknown>)[fn]();
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
