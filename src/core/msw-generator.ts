import fs from "fs";
import path from "path";
import type { OpenApiSpec, ServiceGroup } from "../types/types";
import type { OpenApiSchema } from "../types/types";
import type { MockEndpointEntry } from "../types/mock-config";
import { endpointKey } from "../types/mock-config";
import { toMethodName, capitalize } from "../utils/naming-utils";
import { compileTemplate, writeGenerated } from "../utils/file-writer";
import { mockValueFromSchema } from "../utils/msw-utils";
import type { FakerPlugin } from "./config-loader";

export function generateMswHandlers(
  spec: OpenApiSpec,
  services: Record<string, ServiceGroup>,
  schemas: Record<string, OpenApiSchema>,
  mswDir: string,
  mswTemplatesDir: string,
  opts: {
    mswEndpointFilter?: Set<string>;
    mswEndpointConfigs?: Record<string, MockEndpointEntry>;
    fakerPlugins?: FakerPlugin[];
  },
): void {
  if (!fs.existsSync(mswDir)) fs.mkdirSync(mswDir, { recursive: true });

  const servicesForIndex: { tag: string; tagLowerCase: string }[] = [];
  const filter = opts.mswEndpointFilter;
  const epConfigs = opts.mswEndpointConfigs || {};

  for (const [tag, data] of Object.entries(services)) {
    const tagLowerCase = tag.toLowerCase();

    const handlerFns: Record<string, unknown>[] = [];
    const typeImports: Set<string> = new Set();
    let usesFaker = false;

    for (const op of data.operations) {
      const opKey = endpointKey(tag, op.operationId || "unknown");
      if (filter && !filter.has(opKey)) continue;

      const epCfg = epConfigs[opKey];

      const fnName = `${op.operationId || "unknown"}Handler`;
      const httpMethod = op.method.toLowerCase();

      let pathPattern = op.path;
      for (const p of op.parameters || []) {
        if (p.in === "path") {
          pathPattern = pathPattern.replace(`{${p.name}}`, `:${p.name}`);
        }
      }

      const methodName = toMethodName(op.operationId);
      const capMethod = capitalize(methodName);
      const typeNameResponse = `${tag}${capMethod}Response`;

      let responseTypeName: string | null = null;
      let mockResponse: string;
      let mockComment = false;
      let statusCode =
        httpMethod === "post" ? 201 : httpMethod === "delete" ? 204 : 200;

      // Apply endpoint config override for status code
      if (epCfg?.statusCode) {
        statusCode = epCfg.statusCode;
      }

      if (op.responseSchema) {
        if (op.responseSchema.$ref) {
          mockComment = epCfg?.mockData ? false : true;
          responseTypeName = typeNameResponse;
          mockResponse = `{} as ${responseTypeName}`;
          typeImports.add(typeNameResponse);
        } else if (
          op.responseSchema.type === "array" &&
          op.responseSchema.items?.$ref
        ) {
          mockComment = epCfg?.mockData ? false : true;
          responseTypeName = typeNameResponse;
          mockResponse = `[] as ${responseTypeName}`;
          typeImports.add(typeNameResponse);
        } else {
          responseTypeName = typeNameResponse;
          const mockMode = epCfg?.mockMode || "auto";
          if (mockMode === "faker") {
            usesFaker = true;
            mockResponse = mockValueFromSchema(
              op.responseSchema,
              "faker",
              schemas,
              new Set(),
              epCfg?.fakerArraySize || 3,
              epCfg?.fakerArraySizes || {},
              "root",
              epCfg?.fakerFormats || {},
              opts.fakerPlugins || [],
            );
            mockComment = false;
          } else if (epCfg?.mockData) {
            mockResponse = epCfg.mockData;
            mockComment = false;
          } else {
            mockResponse = mockValueFromSchema(
              op.responseSchema,
              mockMode === "manual" ? "auto" : mockMode,
              schemas,
            );
          }
        }
      } else {
        mockResponse = "null";
      }

      let bodyTypeName: string | null = null;
      let typeNamePayload: string | null = null;
      if (op.hasBody) {
        typeNamePayload = `${tag}${capMethod}Payload`;
        bodyTypeName = typeNamePayload;
        typeImports.add(typeNamePayload);
      }

      handlerFns.push({
        fnName,
        httpMethod,
        pathPattern,
        summary: op.summary || op.operationId || op.method,
        hasBody: op.hasBody,
        bodyTypeName,
        mockResponse,
        mockComment,
        responseTypeName,
        statusCode,
        delayMs: epCfg?.delay || undefined,
        customMockData: epCfg?.mockData || undefined,
        hasError: epCfg?.errorEnabled || false,
        errorStatus: epCfg?.errorStatus || 500,
        errorBody: epCfg?.errorBody || '{"message":"Internal Server Error"}',
      });
    }

    const handlersFilePath = path.join(mswDir, `${tagLowerCase}.handlers.ts`);

    if (handlerFns.length === 0) {
      if (fs.existsSync(handlersFilePath)) {
        fs.unlinkSync(handlersFilePath);
        console.log(`Deleted unused MSW ${tagLowerCase}.handlers.ts`);
      }
      continue;
    }

    const handlersData = {
      tag,
      tagLowerCase,
      handlers: handlerFns,
      typeImports: Array.from(typeImports),
      usesFaker,
    };

    const handlersTemplate = compileTemplate(
      path.join(mswTemplatesDir, "handlers.hbs"),
    );
    writeGenerated(
      handlersFilePath,
      handlersTemplate(handlersData),
    );
    console.log(`Generated MSW ${tagLowerCase}.handlers.ts`);

    servicesForIndex.push({ tag, tagLowerCase });
  }

  const indexFilePath = path.join(mswDir, "index.ts");
  if (servicesForIndex.length > 0) {
    const indexTemplate = compileTemplate(
      path.join(mswTemplatesDir, "index.hbs"),
    );
    writeGenerated(
      indexFilePath,
      indexTemplate({ services: servicesForIndex }),
    );
    console.log("Generated MSW handlers/index.ts");
  } else if (fs.existsSync(indexFilePath)) {
    // Generate an empty index if all mocks are disabled
    writeGenerated(indexFilePath, "export const handlers = [];\n");
    console.log("Emptied MSW handlers/index.ts");
  }
}
