/**
 * SpecShot Template Context Types
 *
 * These interfaces describe the data available in each Handlebars template.
 * Import them in your TypeScript code for autocompletion when building
 * custom templates programmatically:
 *
 *   import type { ModelsContext } from "specshot/templates";
 *
 * For .hbs autocompletion in VS Code:
 *   1. Install the "Handlebars" extension
 *   2. Add a type hint comment at the top of your .hbs file:
 *      {{! @type ModelsContext }}
 *   3. See docs/template-variables.md for full reference
 */

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────

/** A schema definition with Zod expression and plain TS type */
export interface SchemaEntry {
  /** Schema name (e.g. "Pet") */
  name: string;
  /** Zod expression string (e.g. "z.object({ id: z.string() })") */
  zod: string;
  /** Plain TypeScript type string (e.g. "{ id: string }") */
  tsType: string;
}

/** A query parameter */
export interface QueryParam {
  /** Parameter name */
  name: string;
  /** Whether the parameter is required */
  required: boolean;
  /** TypeScript type (e.g. "string", "number") */
  tsType: string;
}

/** A path parameter */
export interface PathParam {
  /** Safe parameter name (sanitized for use as identifier) */
  safe: string;
}

/** An OpenAPI operation */
export interface Operation {
  /** Operation ID from the spec */
  operationId: string;
  /** Generated method name (camelCase) */
  methodName: string;
  /** Summary from OpenAPI spec */
  summary?: string;
  /** Description from OpenAPI spec */
  description?: string;
  /** Path parameters */
  pathParams: PathParam[];
  /** Whether the operation has a request body */
  hasBody: boolean;
  /** Type name for the request payload (e.g. "PetsCreatePetPayload") */
  typeNamePayload: string;
  /** TypeScript type for the request body (e.g. "CreatePetRequest") */
  bodyType: string;
  /** Config type (e.g. "AppRequestConfig") */
  configType: string;
  /** Whether this is a DELETE operation */
  isDelete: boolean;
  /** Whether the operation has query parameters */
  hasQuery: boolean;
  /** Type name for query params (e.g. "PetsListPetsParams") */
  typeNameParams: string;
  /** Array of query parameters */
  queryParams: QueryParam[];
  /** Type name for the response (e.g. "PetsListPetsResponse") */
  typeNameResponse: string;
  /** TypeScript type for the response (e.g. "Pet[]") */
  resType: string;
  /** Lowercase HTTP method (e.g. "get", "post") */
  methodLower: string;
  /** URL string with path param interpolation (e.g. `/pets/${petId}`) */
  urlStr: string;
}

/** A discovered interceptor */
export interface InterceptorEntry {
  /** Interceptor name */
  name: string;
  /** Install function name (e.g. "installBearer") */
  fn: string;
  /** File name without extension (e.g. "bearer") */
  file: string;
  /** Tag/label */
  tag: string;
}

/** A tag entry for the index template */
export interface TagEntry {
  /** Tag name (e.g. "pets") */
  tag: string;
  /** Service class name (e.g. "PetsService") */
  className: string;
  /** Service file name without extension (e.g. "pets.service") */
  serviceFile: string;
}

// ─────────────────────────────────────────────
// Generator template contexts
// ─────────────────────────────────────────────

/** Context for models.hbs */
export interface ModelsContext {
  schemas: SchemaEntry[];
  version: string;
  customCode: string | null;
}

/** Context for types.hbs */
export interface TypesContext {
  tag: string;
  tagPrefix: string;
  imports: string[];
  specificSchemas: SchemaEntry[];
  operations: Operation[];
  modelsModulePath: string;
  customCode: string | null;
}

/** Context for service.hbs */
export interface ServiceContext {
  className: string;
  tagPrefix: string;
  exportsToReExport: string[];
  operations: Operation[];
  corePath: string;
  modelsModulePath: string;
  typesModulePath: string;
  serviceProviderTypesPath: string;
  customCode: string | null;
}

/** Context for index.hbs */
export interface IndexContext {
  tags: TagEntry[];
  corePath: string;
  interceptorsPath: string;
  hasHooks: boolean;
  indexProviderTypesPath: string;
  indexClientPath: string;
  indexHooksPath: string;
  indexServiceDir: string;
  customCode: string | null;
}

/** Context for interceptors-index.hbs */
export interface InterceptorsIndexContext {
  interceptors: InterceptorEntry[];
  hasAuthManager: boolean;
  corePath: string;
}

// ─────────────────────────────────────────────
// MSW template contexts
// ─────────────────────────────────────────────

/** A mock handler entry */
export interface MswHandlerEntry {
  summary: string;
  httpMethod: string;
  pathPattern: string;
  hasBody: boolean;
  request: unknown;
  hasError: boolean;
  errorBody: string;
  errorStatus: number;
  bodyTypeName: string;
  delayMs: number;
  customMockData: string;
  mockResponse: string;
  statusCode: number;
}

/** A service entry for MSW index/browser */
export interface MswServiceEntry {
  tag: string;
  tagLowerCase: string;
  capTag: string;
}

/** Context for msw/handlers.hbs */
export interface MswHandlersContext {
  tag: string;
  tagLowerCase: string;
  capTag: string;
  handlers: MswHandlerEntry[];
  typeImports: Set<string>;
  usesFaker: boolean;
  typesImportPath: string;
}

/** Context for msw/index.hbs */
export interface MswIndexContext {
  services: MswServiceEntry[];
}

/** Context for msw/browser.hbs */
export interface MswBrowserContext {
  services: MswServiceEntry[];
}

// ─────────────────────────────────────────────
// Available Handlebars helpers
// ─────────────────────────────────────────────

/**
 * Naming helpers available in all templates:
 *
 *   {{capitalize name}}        "pets" → "Pets"
 *   {{camelCase name}}         "pet-store" → "petStore"
 *   {{pascalCase name}}        "pet-store" → "PetStore"
 *   {{kebabCase name}}         "PetStore" → "pet-store"
 *   {{snakeCase name}}         "PetStore" → "pet_store"
 *   {{toLowerCase name}}       "PetStore" → "petstore"
 *   {{toUpperCase name}}       "petstore" → "PETSTORE"
 *
 * Conditional helpers:
 *
 *   {{#ifEq tag "pets"}}...{{/ifEq}}      Block renders if equal
 *   {{#ifNeq tag "users"}}...{{/ifNeq}}   Block renders if not equal
 */
export interface HandlebarsHelpers {
  capitalize: (s: string) => string;
  camelCase: (s: string) => string;
  pascalCase: (s: string) => string;
  kebabCase: (s: string) => string;
  snakeCase: (s: string) => string;
  toLowerCase: (s: string) => string;
  toUpperCase: (s: string) => string;
  ifEq: <T>(a: T, b: T, opts: { fn: () => string; inverse: () => string }) => string;
  ifNeq: <T>(a: T, b: T, opts: { fn: () => string; inverse: () => string }) => string;
}
