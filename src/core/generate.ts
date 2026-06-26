import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  JSON_CONTENT_TYPE,
  HTTP_OK,
  RESPONSE_BODY_STRUCT,
  RESPONSE_BODY_PREFIX,
} from "../types/constants";
import type {
  OpenApiSpec,
  OpenApiOperation,
  ServiceGroup,
} from "../types/types";
import {
  cleanRefName,
  extractRefs,
  schemaToTsType,
  schemaToZod,
  resolveSchemaOwnership,
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
  resolveTemplatePath,
} from "../utils/file-writer";
import { loadSpec } from "./spec-loader";
import { loadUserConfig, relModulePath, computeCorePath } from "./config-loader";
import type { TemplateOverrides, OutputPaths } from "./config-loader";
import { formatGeneratedFiles } from "../utils/formatter";
import type { MockEndpointEntry } from "../types/mock-config";
import { generateMswHandlers } from "./msw-generator";
import { generateProviderIndex } from "./provider-index-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateApi(
  specSource: string,
  outputDir: string,
  importAlias?: string,
  templatesOverride?: string | TemplateOverrides,
  opts?: {
    dryRun?: boolean;
    configPath?: string;
    msw?: boolean;
    mswOutputDir?: string;
    mswEndpointFilter?: Set<string>;
    mswEndpointConfigs?: Record<string, MockEndpointEntry>;
    interceptorsDir?: string;
    mswOnly?: boolean;
    outputPaths?: OutputPaths;
  },
) {
  const userConfig = await loadUserConfig(process.cwd());
  const spec = await loadSpec(specSource);

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error(
      `OpenAPI spec at ${specSource} has no endpoints — check your backend routes`,
    );
  }

  if (opts?.dryRun) {
    return Object.keys(spec.paths).length;
  }

  // Resolve which schemas are shared (models.ts) vs tag-local
  const schemas = spec.components?.schemas || {};
  const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

  let defaultTemplatesDir = path.join(__dirname, "../../templates/generator");
  if (
    !fs.existsSync(defaultTemplatesDir) ||
    !fs.existsSync(path.join(defaultTemplatesDir, "models.hbs"))
  ) {
    defaultTemplatesDir = path.join(__dirname, "../templates/generator");
  }

  const tplConfig: TemplateOverrides =
    typeof templatesOverride === "string"
      ? { dir: templatesOverride }
      : (templatesOverride || {});

  const overrideDir = tplConfig.dir
    ? path.resolve(process.cwd(), tplConfig.dir)
    : undefined;

  const perFile = {
    models: tplConfig.models
      ? path.resolve(process.cwd(), tplConfig.models)
      : undefined,
    types: tplConfig.types
      ? path.resolve(process.cwd(), tplConfig.types)
      : undefined,
    service: tplConfig.service
      ? path.resolve(process.cwd(), tplConfig.service)
      : undefined,
    index: tplConfig.index
      ? path.resolve(process.cwd(), tplConfig.index)
      : undefined,
    "interceptors-index": tplConfig["interceptors-index"]
      ? path.resolve(process.cwd(), tplConfig["interceptors-index"])
      : undefined,
  };

  // ── Resolve custom output directories ──
  const providerDir = path.dirname(outputDir);
  const modelsDir = opts?.outputPaths?.models
    ? path.resolve(process.cwd(), opts.outputPaths.models)
    : outputDir;
  const typesDir = opts?.outputPaths?.types
    ? path.resolve(process.cwd(), opts.outputPaths.types)
    : outputDir;
  const servicesDir = opts?.outputPaths?.services
    ? path.resolve(process.cwd(), opts.outputPaths.services)
    : outputDir;
  const indexDir = opts?.outputPaths?.index
    ? path.resolve(process.cwd(), opts.outputPaths.index)
    : providerDir;

  for (const dir of [modelsDir, typesDir, servicesDir, indexDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Only create outputDir if it's actually used (no custom override for that type)
  const usesOutputDir = !opts?.outputPaths?.models || !opts?.outputPaths?.types || !opts?.outputPaths?.services;
  if (usesOutputDir && !fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ── Compute relative module paths for cross-file imports ──
  const modelsModulePath = relModulePath(typesDir, modelsDir, "models");
  const serviceModelsModulePath = relModulePath(servicesDir, modelsDir, "models");
  const serviceProviderTypesPath = relModulePath(servicesDir, providerDir, "types");
  const indexProviderTypesPath = relModulePath(indexDir, providerDir, "types");
  const indexClientPath = relModulePath(indexDir, providerDir, "client");
  const indexHooksPath = relModulePath(indexDir, providerDir, "hooks");
  const indexServiceDir = relModulePath(indexDir, servicesDir, "");
  const indexCorePath = computeCorePath(indexDir, providerDir, importAlias, userConfig.coreDir);
  const servicesCorePath = computeCorePath(servicesDir, providerDir, importAlias, userConfig.coreDir);

  // GENERATE SHARED MODELS (models.ts)
  const modelsPath = path.join(modelsDir, "models.ts");
  const modelsCustomCode = extractCustomCode(modelsPath);

  if (!opts?.mswOnly) {
    const modelsData = {
      schemas: Array.from(sharedSchemas).map((name) => {
        const schemaKey = Object.keys(schemas).find(
          (k) => cleanRefName(k) === name,
        );
        return {
          name,
          zod: schemaKey ? schemaToZod(schemas[schemaKey]) : "z.any()",
          tsType: schemaKey ? schemaToTsType(schemas[schemaKey]) : "unknown",
        };
      }),
      customCode: modelsCustomCode,
    };

    const modelsTemplate = compileTemplate(
      resolveTemplatePath(
        "models.hbs",
        overrideDir,
        defaultTemplatesDir,
        perFile.models,
      ),
    );
    writeGenerated(modelsPath, modelsTemplate(modelsData));
    console.log(`Generated models.ts (Shared Models)`);

    const schemaAliases = modelsData.schemas
      .map((s) => `export const ${s.name}Schema = ${s.name};`)
      .join("\n");
    if (schemaAliases) {
      fs.appendFileSync(modelsPath, `\n${schemaAliases}\n`);
    }
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

  for (const [tag, data] of Object.entries(services)) {
    const className = toClassName(tag);
    const tagPrefix = tag.toLowerCase();
    const serviceFileName = `${tagPrefix}.service.ts`;
    const typesFileName = `${tagPrefix}.types.ts`;

    const modelsToImport = new Set<string>();
    const specificSchemasList: { name: string; zod: string; tsType: string }[] = [];
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
            tsType: schemaToTsType(schemas[schemaKey]),
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

    if (!opts?.mswOnly) {
      const typesPath = path.join(typesDir, typesFileName);
      const typesCustomCode = extractCustomCode(typesPath);

      const typesData = {
        tag,
        imports: Array.from(modelsToImport),
        specificSchemas: specificSchemasList,
        operations: operationsList,
        customCode: typesCustomCode,
        modelsModulePath,
      };

      const typesTemplate = compileTemplate(
        resolveTemplatePath(
          "types.hbs",
          overrideDir,
          defaultTemplatesDir,
          perFile.types,
        ),
      );
      writeGenerated(typesPath, typesTemplate(typesData));
      console.log(`Generated ${typesFileName}`);

      const servicePath = path.join(servicesDir, serviceFileName);
      const serviceCustomCode = extractCustomCode(servicePath);

      const typesModulePath = relModulePath(servicesDir, typesDir, `${tagPrefix}.types`);

      const serviceData = {
        className,
        tagPrefix,
        exportsToReExport: [...Array.from(specificSchemas), ...typeNames],
        operations: operationsList,
        corePath: servicesCorePath,
        customCode: serviceCustomCode,
        typesModulePath,
        serviceProviderTypesPath,
        modelsModulePath: serviceModelsModulePath,
      };

      const serviceTemplate = compileTemplate(
        resolveTemplatePath(
          "service.hbs",
          overrideDir,
          defaultTemplatesDir,
          perFile.service,
        ),
      );
      writeGenerated(servicePath, serviceTemplate(serviceData));
      console.log(`Generated ${serviceFileName}`);
    }
  }

  // -- MSW handler generation --
  if (opts?.msw) {
    const mswDir =
      opts.mswOutputDir || path.join(providerDir, "msw", "handlers");

    let defaultMswTemplatesDir = path.join(__dirname, "../../templates/msw");
    if (
      !fs.existsSync(defaultMswTemplatesDir) ||
      !fs.existsSync(path.join(defaultMswTemplatesDir, "handlers.hbs"))
    ) {
      defaultMswTemplatesDir = path.join(__dirname, "../templates/msw");
    }

    const mswOverrideDir = overrideDir
      ? path.join(overrideDir, "msw")
      : undefined;

    const mswPerFile = {
      handlers: tplConfig.msw?.handlers
        ? path.resolve(process.cwd(), tplConfig.msw.handlers)
        : undefined,
      index: tplConfig.msw?.index
        ? path.resolve(process.cwd(), tplConfig.msw.index)
        : undefined,
      browser: tplConfig.msw?.browser
        ? path.resolve(process.cwd(), tplConfig.msw.browser)
        : undefined,
    };

    generateMswHandlers(
      spec,
      services,
      schemas,
      mswDir,
      defaultMswTemplatesDir,
      {
        mswEndpointFilter: opts.mswEndpointFilter,
        mswEndpointConfigs: opts.mswEndpointConfigs,
        fakerPlugins: userConfig.fakerPlugins,
        providerDir,
        typesDir,
        templatesOverride: mswOverrideDir,
        perFile: mswPerFile,
      },
    );
  }

  // -- Provider index generation --
  if (!opts?.mswOnly) {
    const interceptorsDir = opts?.interceptorsDir
      ? path.resolve(process.cwd(), opts.interceptorsDir)
      : path.join(providerDir, "interceptors");

    generateProviderIndex({
      providerDir,
      indexDir,
      interceptorsDir,
      templatesDir: defaultTemplatesDir,
      templatesOverride: overrideDir,
      perFile,
      corePathStr: indexCorePath,
      services,
      indexProviderTypesPath,
      indexClientPath,
      indexHooksPath,
      indexServiceDir,
      servicesDir,
    });
  }

  // Format all directories that may contain generated files
  const formatDirs = [...new Set([modelsDir, typesDir, servicesDir, indexDir, providerDir])];
  for (const dir of formatDirs) {
    await formatGeneratedFiles(dir);
  }

  console.log(`\nSmart generation complete!`);
}
