import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  JSON_CONTENT_TYPE,
  HTTP_OK,
  RESPONSE_BODY_STRUCT,
  RESPONSE_BODY_PREFIX,
} from "../types/constants";
import type { OpenApiSpec, OpenApiOperation, ServiceGroup } from "../types/types";
import {
  cleanRefName,
  extractRefs,
  schemaToTsType,
  schemaToZod,
} from "./schema-parser";
import {
  toClassName,
  capitalize,
  toCamelCase,
  toMethodName,
} from "../utils/naming-utils";
import {
  extractCustomCode,
  compileTemplate,
  writeGenerated,
} from "../utils/file-writer";
import { loadSpec } from "./spec-loader";
import { resolveConfig } from "../utils/config-resolver";
import { mockValueFromSchema } from "../utils/msw-utils";
import { endpointKey, type MockEndpointEntry } from "../types/mock-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateApi(
  specSource: string,
  outputDir: string,
  importAlias?: string,
  templatesDirOverride?: string,
  opts?: {
    dryRun?: boolean;
    configPath?: string;
    msw?: boolean;
    mswOutputDir?: string;
    mswEndpointFilter?: Set<string>;
    mswEndpointConfigs?: Record<string, MockEndpointEntry>;
  },
) {
  const spec = await loadSpec(specSource);

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error(
      `OpenAPI spec at ${specSource} has no endpoints — check your backend routes`,
    );
  }

  if (opts?.dryRun) {
    return Object.keys(spec.paths).length;
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const schemas = spec.components?.schemas || {};

  const schemaUsage = new Map<string, Set<string>>();
  for (const name of Object.keys(schemas)) {
    schemaUsage.set(cleanRefName(name), new Set<string>());
  }

  const pathEntries = Object.entries(spec.paths ?? {}) as [
    string,
    Record<string, OpenApiOperation>,
  ][];
  for (const [, methods] of pathEntries) {
    for (const operation of Object.values(methods)) {
      if (!operation.tags || operation.tags.length === 0) continue;
      const tag = operation.tags[0];

      const refsInOp = new Set<string>();
      if (operation.requestBody?.content?.[JSON_CONTENT_TYPE]?.schema) {
        extractRefs(
          operation.requestBody.content[JSON_CONTENT_TYPE].schema,
          refsInOp,
        );
      }
      if (
        operation.responses?.[HTTP_OK]?.content?.[JSON_CONTENT_TYPE]?.schema
      ) {
        extractRefs(
          operation.responses[HTTP_OK].content[JSON_CONTENT_TYPE].schema,
          refsInOp,
        );
      }

      for (const ref of refsInOp) {
        if (schemaUsage.has(ref)) schemaUsage.get(ref)!.add(tag);
      }
    }
  }

  // Propagate usage to nested schemas
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, schema] of Object.entries(schemas)) {
      const cleanName = cleanRefName(name);
      if (cleanName === RESPONSE_BODY_STRUCT) continue;

      const nestedRefs = extractRefs(schema);
      const parentTags = schemaUsage.get(cleanName) || new Set();

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

  // Decide where each schema goes
  const sharedSchemas = new Set<string>();
  const tagSchemas = new Map<string, Set<string>>();

  for (const [name, tags] of schemaUsage.entries()) {
    if (name === RESPONSE_BODY_STRUCT || name.startsWith(RESPONSE_BODY_PREFIX))
      continue;

    if (tags.size === 1) {
      const tag = Array.from(tags)[0];
      if (!tagSchemas.has(tag)) tagSchemas.set(tag, new Set<string>());
      tagSchemas.get(tag)!.add(name);
    } else {
      sharedSchemas.add(name);
    }
  }

  const templatesDir = templatesDirOverride
    ? path.resolve(process.cwd(), templatesDirOverride)
    : path.join(__dirname, "../../templates/generator");

  // GENERATE SHARED MODELS (models.ts)
  const modelsPath = path.join(outputDir, "models.ts");
  const modelsCustomCode = extractCustomCode(modelsPath);

  const modelsData = {
    schemas: Array.from(sharedSchemas).map((name) => {
      const schemaKey = Object.keys(schemas).find(
        (k) => cleanRefName(k) === name,
      );
      return {
        name,
        zod: schemaKey ? schemaToZod(schemas[schemaKey]) : "z.any()",
      };
    }),
    customCode: modelsCustomCode,
  };

  const modelsTemplate = compileTemplate(path.join(templatesDir, "models.hbs"));
  writeGenerated(modelsPath, modelsTemplate(modelsData));
  console.log(`Generated models.ts (Shared Models)`);

  const schemaAliases = modelsData.schemas
    .map((s) => `export const ${s.name}Schema = ${s.name};`)
    .join("\n");
  if (schemaAliases) {
    fs.appendFileSync(modelsPath, `\n${schemaAliases}\n`);
  }

  // Group paths by tags
  const services: Record<string, ServiceGroup> = {};

  for (const [pathUrl, methods] of Object.entries(spec.paths) as [
    string,
    Record<string, OpenApiOperation>,
  ][]) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.tags || operation.tags.length === 0) continue;
      const tag = operation.tags[0];
      if (!services[tag]) services[tag] = { name: tag, operations: [] };
      services[tag].operations.push({
        method: method.toUpperCase(),
        path: pathUrl,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        parameters: operation.parameters || [],
        hasBody: !!operation.requestBody,
        hasQuery: !!operation.parameters?.some((p) => p.in === "query"),
        hasPathParams: !!operation.parameters?.some((p) => p.in === "path"),
        responseSchema:
          operation.responses?.[HTTP_OK]?.content?.[JSON_CONTENT_TYPE]?.schema,
        bodySchema: operation.requestBody?.content?.[JSON_CONTENT_TYPE]?.schema,
      });
    }
  }

  const providerDir = path.dirname(outputDir);
  const { corePathStr, servicesCorePath } = resolveConfig(
    outputDir,
    importAlias,
    opts?.configPath,
  );

  for (const [tag, data] of Object.entries(services)) {
    const className = toClassName(tag);
    const tagPrefix = tag.toLowerCase();
    const serviceFileName = `${tagPrefix}.service.ts`;
    const typesFileName = `${tagPrefix}.types.ts`;

    const modelsToImport = new Set<string>();
    const specificSchemasList: { name: string; zod: string }[] = [];
    const specificSchemas = tagSchemas.get(tag) || new Set();

    if (specificSchemas.size > 0) {
      for (const name of specificSchemas) {
        const schemaKey = Object.keys(schemas).find(
          (k) => cleanRefName(k) === name,
        );
        if (schemaKey) {
          const nested = extractRefs(schemas[schemaKey]);
          for (const n of nested)
            if (sharedSchemas.has(n)) modelsToImport.add(n);
          specificSchemasList.push({
            name,
            zod: schemaToZod(schemas[schemaKey]),
          });
        }
      }
    }

    const typeNames: string[] = [];
    const operationsList: Record<string, unknown>[] = [];

    for (const op of data.operations) {
      const methodName = toMethodName(op.operationId);
      const capMethod = capitalize(methodName);

      let typeNamePayload: string | null = null;
      let bodyType = "any";
      if (op.hasBody) {
        typeNamePayload = `${tag}${capMethod}Payload`;
        typeNames.push(typeNamePayload);
        if (op.bodySchema?.$ref) {
          const refName = cleanRefName(op.bodySchema.$ref);
          if (sharedSchemas.has(refName)) modelsToImport.add(refName);
          bodyType = refName;
        } else {
          bodyType = schemaToTsType(op.bodySchema);
        }
      }

      let typeNameParams: string | null = null;
      const queryParamsList: {
        name: string;
        required: boolean | undefined;
        tsType: string;
      }[] = [];
      if (op.hasQuery) {
        typeNameParams = `${tag}${capMethod}Params`;
        typeNames.push(typeNameParams);
        const queryParams = op.parameters.filter((p) => p.in === "query");
        for (const p of queryParams) {
          queryParamsList.push({
            name: p.name,
            required: p.required,
            tsType: schemaToTsType(p.schema),
          });
        }
      }

      const typeNameResponse = `${tag}${capMethod}Response`;
      typeNames.push(typeNameResponse);
      let resType = "void";
      if (op.responseSchema?.$ref) {
        let refName = cleanRefName(op.responseSchema.$ref);
        if (refName !== RESPONSE_BODY_STRUCT) {
          if (refName.startsWith(RESPONSE_BODY_PREFIX)) {
            const schemaKey = Object.keys(schemas).find(
              (k) => cleanRefName(k) === refName,
            );
            const wrapperSchema = schemaKey ? schemas[schemaKey] : undefined;
            if (wrapperSchema?.properties?.data?.$ref) {
              refName = cleanRefName(wrapperSchema.properties.data.$ref);
            } else if (wrapperSchema?.properties?.data?.type) {
              refName = schemaToTsType(wrapperSchema.properties.data);
            }
          }
          if (
            refName &&
            !refName.includes("{") &&
            !["string", "number", "boolean"].includes(refName)
          ) {
            if (sharedSchemas.has(refName)) modelsToImport.add(refName);
          }
          resType = refName || "void";
        }
      } else if (op.responseSchema) {
        const nestedRefs = extractRefs(op.responseSchema);
        for (const ref of nestedRefs) {
          if (sharedSchemas.has(ref)) modelsToImport.add(ref);
        }
        resType = schemaToTsType(op.responseSchema);
      }

      let configType = "AppRequestConfig";
      const pathParamsList: { original: string; safe: string }[] = [];
      if (op.hasPathParams) {
        const params = (op.parameters || []).filter((p) => p.in === "path");
        for (const p of params) {
          pathParamsList.push({ original: p.name, safe: toCamelCase(p.name) });
        }
      }

      if (op.hasQuery)
        configType = `Omit<AppRequestConfig, "params"> & { params?: ${typeNameParams} }`;

      let urlStr = op.path;
      for (const p of pathParamsList) {
        urlStr = urlStr.replace(`{${p.original}}`, `\${${p.safe}}`);
      }

      operationsList.push({
        operationId: op.operationId,
        methodName,
        methodLower: op.method.toLowerCase(),
        hasBody: op.hasBody,
        hasQuery: op.hasQuery,
        summary: op.summary,
        description: op.description
          ? op.description.replace(/\n/g, "\n   * ")
          : null,
        typeNamePayload,
        bodyType,
        typeNameParams,
        queryParams: queryParamsList,
        typeNameResponse,
        resType,
        pathParams: pathParamsList,
        configType,
        urlStr,
        isDelete: op.method === "DELETE",
      });
    }

    const typesPath = path.join(outputDir, typesFileName);
    const typesCustomCode = extractCustomCode(typesPath);

    const typesData = {
      tag,
      imports: Array.from(modelsToImport),
      specificSchemas: specificSchemasList,
      operations: operationsList,
      customCode: typesCustomCode,
    };

    const typesTemplate = compileTemplate(path.join(templatesDir, "types.hbs"));
    writeGenerated(typesPath, typesTemplate(typesData));
    console.log(`Generated ${typesFileName}`);

    const servicePath = path.join(outputDir, serviceFileName);
    const serviceCustomCode = extractCustomCode(servicePath);

    const serviceData = {
      className,
      tagPrefix,
      exportsToReExport: [...Array.from(specificSchemas), ...typeNames],
      operations: operationsList,
      corePath: servicesCorePath,
      customCode: serviceCustomCode,
    };

    const serviceTemplate = compileTemplate(
      path.join(templatesDir, "service.hbs"),
    );
    writeGenerated(servicePath, serviceTemplate(serviceData));
    console.log(`Generated ${serviceFileName}`);
  }

  // -- MSW handler generation --
  if (opts?.msw) {
    const mswDir =
      opts.mswOutputDir || path.join(providerDir, "msw", "handlers");
    if (!fs.existsSync(mswDir)) fs.mkdirSync(mswDir, { recursive: true });

    const mswTemplatesDir = path.join(__dirname, "../templates/msw");
    const servicesForIndex: { tag: string; tagLowerCase: string }[] = [];

    const filter = opts.mswEndpointFilter;
    const epConfigs = opts.mswEndpointConfigs || {};

    for (const [tag, data] of Object.entries(services)) {
      const tagLowerCase = tag.toLowerCase();

      const handlerFns: Record<string, unknown>[] = [];
      const typeImports: Set<string> = new Set();

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
          } else if (epCfg?.mockData) {
            responseTypeName = typeNameResponse;
            mockResponse = mockValueFromSchema(op.responseSchema);
            mockComment = false;
          } else {
            responseTypeName = typeNameResponse;
            mockResponse = mockValueFromSchema(op.responseSchema);
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

      if (handlerFns.length === 0) continue;

      const handlersData = {
        tag,
        tagLowerCase,
        handlers: handlerFns,
        typeImports: Array.from(typeImports),
      };

      const handlersTemplate = compileTemplate(
        path.join(mswTemplatesDir, "handlers.hbs"),
      );
      writeGenerated(
        path.join(mswDir, `${tagLowerCase}.handlers.ts`),
        handlersTemplate(handlersData),
      );
      console.log(`Generated MSW ${tagLowerCase}.handlers.ts`);

      servicesForIndex.push({ tag, tagLowerCase });
    }

    if (servicesForIndex.length > 0) {
      const indexTemplate = compileTemplate(
        path.join(mswTemplatesDir, "index.hbs"),
      );
      writeGenerated(
        path.join(mswDir, "index.ts"),
        indexTemplate({ services: servicesForIndex }),
      );
      console.log("Generated MSW handlers/index.ts");
    }
  }

  // Auto-discover interceptors
  const interceptorsDir = path.join(providerDir, "interceptors");
  const pluginImports: { file: string; fn: string }[] = [];
  if (fs.existsSync(interceptorsDir)) {
    const entries = fs.readdirSync(interceptorsDir);
    for (const entry of entries) {
      if (
        entry === "index.ts" ||
        entry === "bearer-auth-manager.ts" ||
        !entry.endsWith(".ts")
      )
        continue;
      const filePath = path.join(interceptorsDir, entry);
      const content = fs.readFileSync(filePath, "utf8");
      const matches = content.matchAll(/export function (install\w+)/g);
      for (const m of matches) {
        pluginImports.push({ file: entry.replace(/\.ts$/, ""), fn: m[1] });
      }
    }
  }

  // Auto-generate interceptors index
  const interceptorsIndexPath = path.join(
    providerDir,
    "interceptors",
    "index.ts",
  );
  const interceptorsIndexTemplate = compileTemplate(
    path.join(templatesDir, "interceptors-index.hbs"),
  );
  if (!fs.existsSync(path.dirname(interceptorsIndexPath))) {
    fs.mkdirSync(path.dirname(interceptorsIndexPath), { recursive: true });
  }
  writeGenerated(
    interceptorsIndexPath,
    interceptorsIndexTemplate({ plugins: pluginImports }),
  );
  console.log(`Generated interceptors/index.ts`);

  // Auto-generate provider index.ts
  const indexPath = path.join(providerDir, "index.ts");
  const indexCustomCode = extractCustomCode(indexPath);

  const indexData = {
    hasHooks: fs.existsSync(path.join(providerDir, "hooks.ts")),
    corePath: corePathStr,
    tags: Object.keys(services).map((t) => ({
      tag: t.toLowerCase(),
      className: toClassName(t),
    })),
    plugins: pluginImports,
    customCode: indexCustomCode,
  };

  const indexTemplate = compileTemplate(path.join(templatesDir, "index.hbs"));
  writeGenerated(indexPath, indexTemplate(indexData));
  console.log(`Generated provider index.ts`);

  // Try to format files if prettier is available
  try {
    const { execSync } = await import("child_process");
    console.log(`\nFormatting generated files...`);
    execSync(`npx prettier --write "${providerDir}/**/*.{ts,tsx}"`, {
      stdio: "ignore",
    });
  } catch (_e) {
    // Ignore if prettier fails or is missing
  }

  console.log(`\nSmart generation complete!`);
}
