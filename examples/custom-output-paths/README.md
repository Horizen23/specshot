# Custom Output Paths + Custom Templates Example

This example combines two SpecShot features:
1. **Custom output paths** — control WHERE generated files go
2. **Custom templates** — control HOW generated files look (no Zod, no ApiClient, no interceptors)

## What's Different

| Feature | Built-in | This Example |
|---------|----------|-------------|
| Schema format | Zod (`z.object()`) | Plain TypeScript (`type X = {...}`) |
| HTTP client | `ApiClient` + `BaseService` class | Native `fetch()` functions |
| Return type | `Promise<ApiResult<T, E>>` | `Promise<T>` (throws on error) |
| Interceptors | Plugin system | None |
| Validation | Runtime Zod validation | None (compile-time only) |
| Output dirs | All in `<providerDir>/services/` | Split across `src/models`, `src/services`, `src/types`, `src/api` |

## Setup

```bash
npm install
npm run specshot:generate
```

No `specshot init` needed — this example uses custom templates that don't
require the built-in client/core/interceptors scaffolding. No `providerDir`
needed either — all output paths are configured via `outputPaths`.

## Output Structure

```
src/
├── api/
│   └── index.ts                    ← barrel re-exports
├── models/
│   └── models.ts                   ← plain TS types + ApiError (no Zod)
├── services/
│   └── pets.service.ts             ← standalone fetch functions
└── types/
    └── pets.types.ts               ← request/response types
```

## Config

```js
// specshot.config.mjs
export default {
  integration: "none",
  templates: "./templates",       // custom templates directory
  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
      // No providerDir needed — all paths are explicit via outputPaths
      outputPaths: {
        models: "src/models",
        services: "src/services",
        types: "src/types",
        index: "src/api",
      },
    },
  },
};
```

## Custom Templates

All templates live in `./templates/`:

| Template | Purpose |
|----------|---------|
| `models.hbs` | Plain `type X = {...}` (no Zod) |
| `types.hbs` | Request/response types + query interfaces |
| `service.hbs` | Standalone `async function` + native `fetch()` |
| `index.hbs` | Simple `export * from` barrel |
| `interceptors-index.hbs` | Empty `export {}` (no plugin system) |
| `msw/handlers.hbs` | Flat MSW handler array |

## Usage

```ts
import { setBaseUrl, listPets, getPetById } from "./src/services/pets.service";
import type { Pet } from "./src/models/models";

setBaseUrl("https://api.example.com");

// Throws ApiError on non-2xx
const pets: Pet[] = await listPets();
const pet: Pet = await getPetById("123");
```
