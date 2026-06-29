import fs from "fs";
import path from "path";
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
import { loadSpec } from "./spec-loader";
import { loadUserConfig } from "./config-loader";
import type { TemplateOverrides } from "./config-loader";
import { getRegistry } from "./template-registry";
import { getOutputTypeDir, assertPresetHasTemplates } from "./paths";
import { DEFAULT_PRESET } from "./presets";
import { formatGeneratedFiles } from "../utils/formatter";
import { renderTemplates } from "./renderer";
import { extractCustomCode } from "../utils/file-writer";
import type { MockEndpointEntry } from "../types/mock-config";
import { generateMswHandlers } from "./msw-generator";

export async function generateApi(
  specSource: string,
  outputDir: string,
  importAlias?: string,
  templatesOverride?: string | TemplateOverrides,
  opts?: {
    dryRun?: boolean;
    configPath?: string;
    msw?: boolean;
    mswEndpointFilter?: Set<string>;
    mswEndpointConfigs?: Record<string, MockEndpointEntry>;
    mswOnly?: boolean;
    preset?: string;
    templateData?: Record<string, unknown>;
  },
) {
  const userConfig = await loadUserConfig(process.cwd(), opts?.configPath);
  const spec = await loadSpec(specSource);

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error(
      `OpenAPI spec at ${specSource} has no endpoints — check your backend routes`,
    );
  }

  const schemas = spec.components?.schemas || {};
  const { sharedSchemas, tagSchemas } = resolveSchemaOwnership(spec);

  const preset = opts?.preset || userConfig.preset || DEFAULT_PRESET;
  assertPresetHasTemplates(preset);
  const defaultTemplatesDir = getOutputTypeDir(preset, "api");

  const tplConfig: TemplateOverrides =
    typeof templatesOverride === "string"
      ? { dir: templatesOverride }
      : templatesOverride || {};

  const overrideDir = tplConfig.dir
    ? path.resolve(process.cwd(), tplConfig.dir)
    : undefined;

  // ── Dry-run: just validate templates ──
  if (opts?.dryRun) {
    const endpointCount = Object.keys(spec.paths).length;
    let validatedCount = 0;
    const tplDir = overrideDir || defaultTemplatesDir;
    if (fs.existsSync(tplDir)) {
      const entries = fs.readdirSync(tplDir, {
        recursive: true,
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (
          entry.isFile() &&
          entry.name.endsWith(".hbs") &&
          !entry.name.startsWith("_")
        ) {
          validatedCount++;
        }
      }
    }
    if (opts?.msw) {
      const mswTplDir = getOutputTypeDir(preset, "mocks");
      const mswOverrideDir = overrideDir
        ? path.join(overrideDir, "msw")
        : undefined;
      const checkDir = mswOverrideDir || mswTplDir;
      if (fs.existsSync(checkDir)) {
        const entries = fs.readdirSync(checkDir, {
          recursive: true,
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (
            entry.isFile() &&
            entry.name.endsWith(".hbs") &&
            !entry.name.startsWith("_")
          )
            validatedCount++;
        }
      }
    }
    console.log(`  Templates validated: ${validatedCount} templates`);
    return endpointCount;
  }

  // ── Ensure output directory exists (renderer creates subdirs as needed) ──
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ── Group paths by tags ──
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

  // ── Build per-tag data and shared models data ──
  const sharedModelsData: { name: string; zod: string; tsType: string }[] = [];
  for (const name of sharedSchemas) {
    const schemaKey = Object.keys(schemas).find(
      (k) => cleanRefName(k) === name,
    );
    sharedModelsData.push({
      name,
      zod: schemaKey ? schemaToZod(schemas[schemaKey]) : "z.any()",
      tsType: schemaKey ? schemaToTsType(schemas[schemaKey]) : "unknown",
    });
  }

  const tagsData: Record<string, unknown>[] = [];

  for (const [tag, data] of Object.entries(services)) {
    const className = toClassName(tag);
    const tagPrefix = tag.toLowerCase();

    const modelsToImport = new Set<string>();
    const specificSchemasList: { name: string; zod: string; tsType: string }[] =
      [];
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
      const capTag = capitalize(tag);

      let typeNamePayload: string | null = null;
      let bodyType = "any";
      if (op.hasBody) {
        typeNamePayload = `${capTag}${capMethod}Payload`;
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
        typeNameParams = `${capTag}${capMethod}Params`;
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

      const typeNameResponse = `${capTag}${capMethod}Response`;
      typeNames.push(typeNameResponse);
      let resType = "void";
      let resZod = "z.any()";
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
          resZod = refName ? `${refName}Schema` : "z.any()";
        }
      } else if (op.responseSchema) {
        const nestedRefs = extractRefs(op.responseSchema);
        for (const ref of nestedRefs) {
          if (sharedSchemas.has(ref)) modelsToImport.add(ref);
        }
        resType = schemaToTsType(op.responseSchema);
        resZod = schemaToZod(op.responseSchema);
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
        resZod,
        pathParams: pathParamsList,
        configType,
        urlStr,
        isDelete: op.method === "DELETE",
      });
    }

    tagsData.push({
      name: tag,
      tag: tagPrefix,
      tagPrefix,
      className,
      imports: Array.from(modelsToImport),
      specificSchemas: specificSchemasList,
      operations: operationsList,
      tagLowerCase: tagPrefix,
      exportsToReExport: [...Array.from(specificSchemas), ...typeNames],
    });
  }

  // ── Build template data ──
  const coreOutRaw =
    (opts?.templateData?.coreOut as string) ||
    (userConfig.templateData?.coreOut as string) ||
    path.join(outputDir, "../../core");
  const coreAbs = path.isAbsolute(coreOutRaw)
    ? coreOutRaw
    : path.resolve(process.cwd(), coreOutRaw);
  const renderData: Record<string, unknown> = {
    ...userConfig.templateData,
    ...opts?.templateData,
    tags: tagsData,
    sharedSchemas: sharedModelsData,
    outputDir: path.relative(process.cwd(), outputDir),
    outDir: path.relative(process.cwd(), path.dirname(outputDir)),
    coreOut: path.relative(process.cwd(), coreAbs),
    importAlias,
    schemas: sharedModelsData,
  };

  // ── Render templates ──
  let renderDir = overrideDir || defaultTemplatesDir;
  if (overrideDir) {
    const entries = fs.readdirSync(overrideDir, {
      recursive: true,
      withFileTypes: true,
    });
    const hasHbs = entries.some((e) => e.isFile() && e.name.endsWith(".hbs"));
    if (!hasHbs) renderDir = defaultTemplatesDir;
  }
  renderTemplates({
    templateDir: renderDir,
    data: renderData,
    defaultTarget: path.relative(process.cwd(), outputDir),
    behavior: "generated",
    enhanceData: ({ outputPath }) => {
      if (!outputPath) return {};
      const fileDir = path.dirname(outputPath);
      const coreRelPath = path.relative(fileDir, coreAbs);
      // types.ts at {outDir}/../types.ts (sibling of outDir)
      const outDirRaw =
        (opts?.templateData?.outDir as string) || path.dirname(outputDir);
      const outDirAbs = path.isAbsolute(outDirRaw)
        ? outDirRaw
        : path.resolve(process.cwd(), outDirRaw);
      const typesFile = path.join(path.dirname(outDirAbs), "types.ts");
      const typesRelPath = path
        .relative(fileDir, typesFile)
        .replace(/\.ts$/, "");
      const custom = extractCustomCode(outputPath);
      return {
        coreRelPath,
        typesRelPath,
        ...(custom !== null ? { customCode: custom } : {}),
      };
    },
  });

  // -- MSW handler generation --
  if (opts?.msw) {
    const mswDir = path.join(path.dirname(outputDir), "msw", "handlers");
    const defaultMswTemplatesDir = getOutputTypeDir(preset, "mocks");

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
        servicesDir: outputDir,
        typesDir: outputDir,
        templatesOverride: overrideDir
          ? path.join(overrideDir, "msw")
          : undefined,
        perFile: Object.fromEntries(
          getRegistry(preset)
            .filter((t) => t.group === "msw" && t.configKey)
            .map((t) => {
              const override = tplConfig[t.configKey!];
              return [
                t.file,
                override ? path.resolve(process.cwd(), override) : undefined,
              ];
            }),
        ),
      },
    );
  }

  // ── Format generated files (scan outputDir tree for generated .ts files) ──
  await formatGeneratedFiles(outputDir);
  if (opts?.msw) {
    await formatGeneratedFiles(path.join(path.dirname(outputDir), "msw"));
  }

  console.log(`\nSmart generation complete!`);
}
