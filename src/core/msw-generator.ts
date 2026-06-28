import fs from "fs";
import path from "path";
import os from "os";
import type { OpenApiSpec, OpenApiSchema, ServiceGroup } from "../types/types";
import type { MockEndpointEntry } from "../types/mock-config";
import { endpointKey } from "../types/mock-config";
import { toMethodName, capitalize } from "../utils/naming-utils";
import { mockValueFromSchema } from "../utils/msw-utils";
import { renderTemplates } from "./renderer";
import type { FakerPlugin } from "./config-loader";

export function generateMswHandlers(
  spec: OpenApiSpec,
  services: Record<string, ServiceGroup>,
  schemas: Record<string, OpenApiSchema>,
  mswDir: string,
  mswTemplatesDir: string,
  opts?: {
    mswEndpointFilter?: Set<string>;
    mswEndpointConfigs?: Record<string, MockEndpointEntry>;
    fakerPlugins?: FakerPlugin[];
    servicesDir?: string;
    typesDir?: string;
    templatesOverride?: string;
    perFile?: Record<string, string | undefined>;
  },
): void {
  if (!fs.existsSync(mswDir)) fs.mkdirSync(mswDir, { recursive: true });

  const filter = opts?.mswEndpointFilter;
  const epConfigs = opts?.mswEndpointConfigs || {};
  let globalUsesFaker = false;

  const tags: Record<string, unknown>[] = [];
  const servicesForIndex: {
    tag: string;
    tagLowerCase: string;
    capTag: string;
  }[] = [];

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
      const capTag = capitalize(tag);
      const typeNameResponse = `${capTag}${capMethod}Response`;

      let responseTypeName: string | null = null;
      let mockResponse: string;
      let mockComment = false;
      let statusCode =
        httpMethod === "post" ? 201 : httpMethod === "delete" ? 204 : 200;

      if (epCfg?.statusCode) statusCode = epCfg.statusCode;

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
              opts?.fakerPlugins || [],
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
      if (op.hasBody) {
        bodyTypeName = `${capTag}${capMethod}Payload`;
        typeImports.add(bodyTypeName);
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

    if (handlerFns.length === 0) {
      const handlersFilePath = path.join(mswDir, `${tagLowerCase}.handlers.ts`);
      if (fs.existsSync(handlersFilePath)) {
        fs.unlinkSync(handlersFilePath);
        console.log(`Deleted unused MSW ${tagLowerCase}.handlers.ts`);
      }
      continue;
    }

    if (usesFaker) globalUsesFaker = true;

    const actualTypesDir = opts?.typesDir
      ? opts.typesDir
      : opts?.servicesDir
        ? opts.servicesDir
        : path.join(path.dirname(mswDir), "services");
    const typesFilePath = path.join(actualTypesDir, `${tagLowerCase}.types`);
    let typesImportPath = path.relative(mswDir, typesFilePath);
    if (!typesImportPath.startsWith("."))
      typesImportPath = `./${typesImportPath}`;
    typesImportPath = typesImportPath.replace(/\\/g, "/");

    tags.push({
      tag,
      capTag: capitalize(tag),
      tagLowerCase,
      handlers: handlerFns,
      typeImports: Array.from(typeImports),
      usesFaker,
      typesImportPath,
    });

    servicesForIndex.push({ tag, tagLowerCase, capTag: capitalize(tag) });
  }

  // Handle per-file overrides by merging into a temp metadata structure
  let renderDir = opts?.templatesOverride || mswTemplatesDir;
  const perFileEntries = opts?.perFile
    ? Object.entries(opts.perFile).filter(([, v]) => v)
    : [];
  if (perFileEntries.length > 0) {
    const mergedDir = path.join(os.tmpdir(), `specshot-msw-tpl-${Date.now()}`);
    fs.mkdirSync(mergedDir, { recursive: true });
    // Copy default metadata structure
    for (const entry of fs.readdirSync(mswTemplatesDir, {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) {
        fs.cpSync(
          path.join(mswTemplatesDir, entry.name),
          path.join(mergedDir, entry.name),
          { recursive: true },
        );
      } else if (entry.name.endsWith(".hbs") && !entry.name.startsWith("_")) {
        // Don't copy old flat files
      }
    }
    // Override with per-file paths (keys are template file paths)
    for (const [relPath, srcFile] of perFileEntries) {
      if (srcFile && fs.existsSync(srcFile)) {
        const dst = path.join(mergedDir, relPath);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.cpSync(srcFile, dst);
      }
    }
    renderDir = mergedDir;
  }

  const renderData: Record<string, unknown> = {
    mswDir: path.relative(process.cwd(), mswDir),
    tags,
    services: servicesForIndex,
    usesFaker: globalUsesFaker,
  };

  renderTemplates({
    templateDir: renderDir,
    data: renderData,
  });
}
