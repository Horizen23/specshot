import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateApi(openapiUrl: string, outputDir: string, importAlias?: string, templatesDirOverride?: string) {
  console.log(`\nFetching OpenAPI spec from ${openapiUrl}...`);
  const res = await fetch(openapiUrl);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`OpenAPI spec not found at ${openapiUrl} — is your backend running?`);
    }
    throw new Error(`Failed to fetch OpenAPI spec from ${openapiUrl}: HTTP ${res.status} ${res.statusText}`);
  }
  const spec = await res.json();

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    throw new Error(`OpenAPI spec at ${openapiUrl} has no endpoints — check your backend routes`);
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function extractCustomCode(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/\/\/ --- CUSTOM CODE START ---([\s\S]*?)\/\/ --- CUSTOM CODE END ---/);
  if (match && match[1]) {
    return match[1].replace(/^\n|\n$/g, "");
  }
  return null;
}

function compileTemplate(hbsPath: string): HandlebarsTemplateDelegate<any> {
  try {
    const hbs = fs.readFileSync(hbsPath, "utf8");
    return Handlebars.compile(hbs);
  } catch (e) {
    throw new Error(`Failed to compile template ${path.basename(hbsPath)}: ${(e as Error).message}`);
  }
}

function writeGenerated(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content);
  } catch (e) {
    throw new Error(`Failed to write ${path.basename(filePath)}: ${(e as Error).message}`);
  }
}

function toClassName(str) { return str.replace(/[^a-zA-Z0-9]/g, "") + "Service"; }
const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

const toCamelCase = str => str.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));

function toMethodName(operationId) {
  if (!operationId) return "unknownMethod";
  const parts = operationId.split(":");
  const name = parts[parts.length - 1];
  return name.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function cleanRefName(ref) {
  if (!ref) return null;
  return ref.split('/').pop().replace(/[^a-zA-Z0-9_]/g, "");
}

// Extract all direct $refs from a schema object
function extractRefs(schema, refs = new Set()) {
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

// Convert JSON Schema to pure TS String
function schemaToTsType(schema) {
  if (!schema) return "any";
  if (schema.$ref) {
    let refName = cleanRefName(schema.$ref);
    if (refName === "ResponseBodyStruct") return "void";
    return refName;
  }
  
  if (schema.type === "array") {
    return `${schemaToTsType(schema.items)}[]`;
  }
  
  if (schema.type === "object" || schema.properties) {
    const props = [];
    const required = schema.required || [];
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      const isRequired = required.includes(key);
      const q = isRequired ? "" : "?";
      const safeKey = key.includes("-") || key.includes(" ") ? `"${key}"` : key;
      props.push(`  ${safeKey}${q}: ${schemaToTsType(propSchema)};`);
    }
    if (props.length === 0) return "Record<string, any>";
    return `{\n${props.join("\n")}\n}`;
  }

  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "string") {
    if (schema.enum) return schema.enum.map(e => `"${e}"`).join(" | ");
    return "string";
  }
  if (schema.type === "boolean") return "boolean";
  
  return "any";
}

function schemaToZod(schema) {
  if (schema.$ref) {
    return `${cleanRefName(schema.$ref)}Schema`;
  }
  if (schema.type === "array") {
    return `z.array(${schemaToZod(schema.items)})`;
  }
  if (schema.type === "object" || schema.properties) {
    const props = [];
    const required = schema.required || [];
    for (const [key, propSchema] of Object.entries(schema.properties || {})) {
      const isRequired = required.includes(key);
      const safeKey = key.includes("-") || key.includes(" ") ? `"${key}"` : key;
      let zodType = schemaToZod(propSchema);
      if (!isRequired) zodType += ".optional()";
      props.push(`  ${safeKey}: ${zodType},`);
    }
    if (props.length === 0) return "z.record(z.any())";
    return `z.object({\n${props.join("\n")}\n})`;
  }
  if (schema.type === "integer" || schema.type === "number") return "z.number()";
  if (schema.type === "string") {
    if (schema.enum) return `z.enum([${schema.enum.map(e => `"${e}"`).join(", ")}])`;
    return "z.string()";
  }
  if (schema.type === "boolean") return "z.boolean()";
  
  return "z.any()";
}


  const schemas = spec.components?.schemas || {};
  
  // 1. Map schemas to the tags that use them
  const schemaUsage = new Map(); // schemaName -> Set of tags
  for (const name of Object.keys(schemas)) {
    schemaUsage.set(cleanRefName(name), new Set());
  }

  // Scan operations to assign tags
  for (const methods of Object.values(spec.paths)) {
    for (const operation of Object.values(methods)) {
      if (!operation.tags || operation.tags.length === 0) continue;
      const tag = operation.tags[0];
      
      const refsInOp = new Set();
      if (operation.requestBody?.content?.["application/json"]?.schema) {
        extractRefs(operation.requestBody.content["application/json"].schema, refsInOp);
      }
      if (operation.responses?.["200"]?.content?.["application/json"]?.schema) {
        extractRefs(operation.responses["200"].content["application/json"].schema, refsInOp);
      }
      
      for (const ref of refsInOp) {
        if (schemaUsage.has(ref)) schemaUsage.get(ref).add(tag);
      }
    }
  }

  // Propagate usage to nested schemas (e.g. PageResponseTruckResponse -> TruckResponse)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, schema] of Object.entries(schemas)) {
      const cleanName = cleanRefName(name);
      if (cleanName === "ResponseBodyStruct") continue;
      
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
  const sharedSchemas = new Set();
  const tagSchemas = new Map(); // tag -> Set of schemas

  for (const [name, tags] of schemaUsage.entries()) {
    if (name === "ResponseBodyStruct" || name.startsWith("ResponseBody")) continue; // We unwrap envelopes
    
    if (tags.size === 1) {
      const tag = Array.from(tags)[0];
      if (!tagSchemas.has(tag)) tagSchemas.set(tag, new Set());
      tagSchemas.get(tag).add(name);
    } else {
      sharedSchemas.add(name);
    }
  }

  const templatesDir = templatesDirOverride
    ? path.resolve(process.cwd(), templatesDirOverride)
    : path.join(__dirname, "../templates/generator");

  // 2. GENERATE SHARED MODELS (models.ts)
  const modelsPath = path.join(outputDir, "models.ts");
  const modelsCustomCode = extractCustomCode(modelsPath);

  const modelsData = {
    schemas: Array.from(sharedSchemas).map(name => {
      const schemaKey = Object.keys(schemas).find(k => cleanRefName(k) === name);
      return {
        name,
        zod: schemaToZod(schemas[schemaKey])
      };
    }),
    customCode: modelsCustomCode
  };
  
  const modelsTemplate = compileTemplate(path.join(templatesDir, "models.hbs"));
  writeGenerated(modelsPath, modelsTemplate(modelsData));
  console.log(`Generated models.ts (Shared Models)`);

  // Group paths by tags
  const services = {};
  for (const [pathUrl, methods] of Object.entries(spec.paths)) {
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
        hasQuery: !!operation.parameters?.some(p => p.in === "query"),
        hasPathParams: !!operation.parameters?.some(p => p.in === "path"),
        responseSchema: operation.responses?.["200"]?.content?.["application/json"]?.schema,
        bodySchema: operation.requestBody?.content?.["application/json"]?.schema
      });
    }
  }

  const providerDir = path.dirname(outputDir);
  
  // Try to load config
  const configPath = path.resolve(process.cwd(), "specshot.json");
  let config: any = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch(e) {}
  }
  
  // Resolve core path
  let corePathStr = importAlias ? `${importAlias}/core` : "../core";
  if (!importAlias && config.coreDir) {
    const targetCoreDir = path.resolve(process.cwd(), config.coreDir);
    corePathStr = path.relative(providerDir, targetCoreDir).replace(/\\/g, "/");
    if (!corePathStr.startsWith(".")) corePathStr = "./" + corePathStr;
  }

  // Calculate paths for services
  let servicesCorePath = importAlias ? `${importAlias}/core` : "../" + corePathStr;

  for (const [tag, rawData] of Object.entries(services)) {
    const data = rawData as any;
    const className = toClassName(tag);
    const tagPrefix = tag.toLowerCase();
    const serviceFileName = `${tagPrefix}.service.ts`;
    const typesFileName = `${tagPrefix}.types.ts`;

    // ==========================================
    // 3. GENERATE TYPES & SERVICE FILES
    // ==========================================
    const modelsToImport = new Set();
    const specificSchemasList = [];
    const specificSchemas = tagSchemas.get(tag) || new Set();
    
    if (specificSchemas.size > 0) {
      for (const name of specificSchemas) {
        const schemaKey = Object.keys(schemas).find(k => cleanRefName(k) === name);
        if (schemaKey) {
          const nested = extractRefs(schemas[schemaKey]);
          for (const n of nested) if (sharedSchemas.has(n)) modelsToImport.add(n);
          specificSchemasList.push({
            name,
            zod: schemaToZod(schemas[schemaKey])
          });
        }
      }
    }

    const typeNames = [];
    const operationsList = [];

    for (const op of data.operations) {
      const methodName = toMethodName(op.operationId);
      const capMethod = capitalize(methodName);
      
      let typeNamePayload = null;
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

      let typeNameParams = null;
      const queryParamsList = [];
      if (op.hasQuery) {
        typeNameParams = `${tag}${capMethod}Params`;
        typeNames.push(typeNameParams);
        const queryParams = op.parameters.filter(p => p.in === "query");
        for (const p of queryParams) {
          queryParamsList.push({ name: p.name, required: p.required, tsType: schemaToTsType(p.schema) });
        }
      }

      const typeNameResponse = `${tag}${capMethod}Response`;
      typeNames.push(typeNameResponse);
      let resType = "void";
      if (op.responseSchema?.$ref) {
        let refName = cleanRefName(op.responseSchema.$ref);
        if (refName !== "ResponseBodyStruct") {
          if (refName.startsWith("ResponseBody")) {
             const wrapperSchema = schemas[Object.keys(schemas).find(k => cleanRefName(k) === refName)];
             if (wrapperSchema?.properties?.data?.$ref) {
               refName = cleanRefName(wrapperSchema.properties.data.$ref);
             } else if (wrapperSchema?.properties?.data?.type) {
               refName = schemaToTsType(wrapperSchema.properties.data);
             }
          }
          if (!refName.includes("{") && !["string", "number", "boolean"].includes(refName)) {
             if (sharedSchemas.has(refName)) modelsToImport.add(refName);
          }
          resType = refName;
        }
      }

      let configType = "AppRequestConfig";
      const pathParamsList = [];
      if (op.hasPathParams) {
        const params = op.parameters.filter(p => p.in === "path");
        for (const p of params) {
          pathParamsList.push({ original: p.name, safe: toCamelCase(p.name) });
        }
      }

      if (op.hasQuery) configType = `Omit<AppRequestConfig, "params"> & { params?: ${typeNameParams} }`;

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
        description: op.description ? op.description.replace(/\n/g, "\n   * ") : null,
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
      customCode: typesCustomCode
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
      customCode: serviceCustomCode
    };

    const serviceTemplate = compileTemplate(path.join(templatesDir, "service.hbs"));
    writeGenerated(servicePath, serviceTemplate(serviceData));
    console.log(`Generated ${serviceFileName}`);
  }

  // Auto-discover interceptors
  const interceptorsDir = path.join(providerDir, "interceptors");
  const pluginImports: { file: string; fn: string }[] = [];
  if (fs.existsSync(interceptorsDir)) {
    const entries = fs.readdirSync(interceptorsDir);
    for (const entry of entries) {
      if (entry === "index.ts" || entry === "bearer-auth-manager.ts" || !entry.endsWith(".ts")) continue;
      const filePath = path.join(interceptorsDir, entry);
      const content = fs.readFileSync(filePath, "utf8");
      const matches = content.matchAll(/export function (install\w+)/g);
      for (const m of matches) {
        pluginImports.push({ file: entry.replace(/\.ts$/, ""), fn: m[1] });
      }
    }
  }

  // Auto-generate interceptors index
  const interceptorsIndexPath = path.join(providerDir, "interceptors", "index.ts");
  const interceptorsIndexTemplate = compileTemplate(path.join(templatesDir, "interceptors-index.hbs"));
  if (!fs.existsSync(path.dirname(interceptorsIndexPath))) {
    fs.mkdirSync(path.dirname(interceptorsIndexPath), { recursive: true });
  }
  writeGenerated(interceptorsIndexPath, interceptorsIndexTemplate({ plugins: pluginImports }));
  console.log(`Generated interceptors/index.ts`);

  // ==========================================
  // 5. AUTO-GENERATE PROVIDER index.ts
  // ==========================================
  const indexPath = path.join(providerDir, "index.ts");
  const indexCustomCode = extractCustomCode(indexPath);

  const indexData = {
    hasHooks: fs.existsSync(path.join(providerDir, "hooks.ts")),
    corePath: corePathStr,
    tags: Object.keys(services).map(t => ({
      tag: t.toLowerCase(),
      className: toClassName(t)
    })),
    plugins: pluginImports,
    customCode: indexCustomCode
  };

  const indexTemplate = compileTemplate(path.join(templatesDir, "index.hbs"));
  writeGenerated(indexPath, indexTemplate(indexData));
  console.log(`Generated provider index.ts`);

  // Try to format files if prettier is available
  try {
    const { execSync } = await import("child_process");
    console.log(`\nFormatting generated files...`);
    execSync(`npx prettier --write "${providerDir}/**/*.{ts,tsx}"`, { stdio: "ignore" });
  } catch (e) {
    // Ignore if prettier fails or is missing
  }

  console.log(`\nSmart generation complete!`);
}
