# Custom Templates Example — Functional Fetch API

This example demonstrates how to **completely change the code generation style** using custom Handlebars templates. Instead of the built-in OOP class + BaseService + ApiClient pattern, this example generates a **functional fetch API** with standalone async functions, native `fetch()`, and a schema registry.

## What this example shows

### Built-in style vs. Custom style

| Aspect | Built-in | This custom template |
|--------|----------|---------------------|
| **Service** | `class PetsService extends BaseService<"pets">` | `export async function listPets()`, `export async function createPet()`, ... |
| **HTTP client** | `ApiClient` with interceptors, plugins, `withSignal()` | Native `fetch()` with `RequestInit` |
| **Return type** | `Promise<ApiResult<T, AppApiErrorData>>` (data + error + ok) | `Promise<T>` (data or throws `ApiError`) |
| **Error handling** | Result object: `{ ok: false, error }` | Throw `ApiError` with `status` and `body` |
| **Base URL** | `createApiClient()` with `VITE_API_BASE_URL` | `setBaseUrl("https://...")` function |
| **Models** | `export const Pet = z.object(...)` + `export type Pet = z.infer<...>` | `export const PetSchema = z.object(...)` + `export type Pet = z.infer<...>` + `schemas` registry |
| **Types** | Single `import { Pet, PetSchema }` | Split `import type { Pet }` + `import { PetSchema }` |
| **Query params** | `type XParams = { ... }` | `interface XParams { ... }` |
| **Provider index** | `createApi(client)`, `browserClient`, `browserApi`, `useAllPlugins()` | Simple `export * from "./services/pets.service"` |
| **Interceptors** | Plugin registry with `useAllPlugins(client)` | `export {}` (no-op — not needed for functional style) |
| **MSW handlers** | `getPetsHandlers(baseUrl)` factory function | `petsHandlers` flat array export |

### Custom templates in this example

All 5 generator templates + 1 MSW template are overridden:

1. **`service.hbs`** — Generates standalone `export async function` calls using native `fetch()`. No class, no BaseService, no ApiClient. Includes `setBaseUrl()`/`getBaseUrl()` and a custom `ApiError` class.
2. **`models.hbs`** — Exports schemas with `{{name}}Schema` naming convention (consistent with how `schemaToZod()` generates refs). Groups all schemas in a `schemas` registry object for runtime access.
3. **`types.hbs`** — Uses `import type` for type-only imports and separate `import` for schema consts. Uses `interface` for query parameter types.
4. **`index.hbs`** — Simple barrel `export * from` — no `createApi()`, no `browserClient`, no plugin system.
5. **`interceptors-index.hbs`** — Empty `export {}` (the functional approach doesn't use ApiClient/plugins).
6. **`msw/handlers.hbs`** — Flat `petsHandlers` array export instead of a `getPetsHandlers(baseUrl)` factory function.

## Quick Start

```bash
# Install specshot from the repo root
npm install

# Scaffold the API core (one-time)
npm run specshot:init

# Generate services using custom templates
npm run specshot:generate
```

After generation, inspect the output in `src/lib/api/petstore/services/`:

- `pets.service.ts` — standalone async functions with native fetch
- `models.ts` — schema registry pattern
- `pets.types.ts` — split type/schema imports, interface for query params
- `index.ts` — simple barrel exports
- `interceptors/index.ts` — empty no-op

## Usage example

```ts
import { setBaseUrl, listPets, createPet, getPet } from "./src/lib/api/petstore";

// Configure base URL once
setBaseUrl("https://api.example.com");

// Call functions directly — throws ApiError on failure
try {
  const pets = await listPets();
  const newPet = await createPet({ name: "Rex", species: "dog" });
  const pet = await getPet(newPet.id);
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`${err.status}: ${err.message}`);
  }
}
```

Compare this to the built-in style:

```ts
// Built-in: OOP with result objects
import { browserApi } from "./src/lib/api/petstore";
const { data, error, ok } = await browserApi.pets.listPets();
if (!ok) { console.error(error.message); return; }
```

## Directory structure

```
custom-templates/
  openapi.json              # Petstore spec
  specshot.config.mjs       # Config with templates: "./templates"
  templates/                # All 5 generator templates + MSW
    service.hbs             # Functional fetch functions
    models.hbs              # Schema registry with {{name}}Schema naming
    types.hbs               # import type + interface for query params
    index.hbs               # Simple barrel exports
    interceptors-index.hbs  # No-op (empty export)
    msw/
      handlers.hbs          # Flat array export (no factory function)
  package.json
```

## Partial override

You don't need to copy all templates. Only the files present in your `templates/` directory override the built-ins. Missing files automatically use defaults.

This example overrides **all** templates for a complete style change, but you could override just `service.hbs` to add a `*WithRetry()` method while keeping the built-in style for everything else.

### Ejecting built-in templates

To start from the built-in templates and customize from there:

```bash
npx specshot templates --output ./templates
```

This copies all built-in templates (generator + MSW) to `./templates/`. Then edit only the files you want to change.

## Template Context Variables

Each template receives context from the generator:

| Template | Key variables |
|----------|---------------|
| `service.hbs` | `className`, `tagPrefix`, `operations`, `corePath`, `exportsToReExport`, `customCode` |
| `models.hbs` | `schemas` (array of `{ name, zod }`), `version`, `customCode` |
| `types.hbs` | `tag`, `imports`, `specificSchemas`, `operations`, `customCode` |
| `index.hbs` | `tags` (array of `{ tag, className }`), `corePath`, `interceptorsPath`, `hasHooks`, `customCode` |
| `interceptors-index.hbs` | `interceptors` (array of `{ fn, file }`), `hasAuthManager` |
| `msw/handlers.hbs` | `tag`, `tagLowerCase`, `handlers`, `typeImports`, `usesFaker`, `typesImportPath` |

Each `operation` object contains:
- `operationId`, `methodName`, `summary`, `description`
- `methodLower` (get/post/put/patch/delete)
- `pathParams` (array of `{ original, safe }`), `hasBody`, `typeNamePayload`, `bodyType`
- `hasQuery`, `typeNameParams`, `queryParams` (array of `{ name, required, tsType }`)
- `typeNameResponse`, `resType`, `urlStr`, `configType`, `isDelete`

### Custom code preservation

Generated files include `// --- CUSTOM CODE START ---` / `// --- CUSTOM CODE END ---` markers. Any code you add between these markers survives regeneration.
