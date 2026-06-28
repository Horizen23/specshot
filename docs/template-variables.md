# Custom Templates — Template Variables Reference

This document lists all variables available in each Handlebars template.

## Template Files

| Template | Output File | Purpose |
|----------|-------------|---------|
| `models.hbs` | `models.ts` | Shared schemas and types |
| `types.hbs` | `<tag>.types.ts` | Per-tag request/response types |
| `service.hbs` | `<tag>.service.ts` | Per-tag API service class |
| `index.hbs` | `index.ts` | Provider barrel exports |
| `plugins-index.hbs` | `plugins/index.ts` | Plugin registry |
| `msw/handlers.hbs` | `<tag>.handlers.ts` | MSW mock handlers |
| `msw/index.hbs` | `index.ts` | MSW handlers barrel |
| `msw/browser.hbs` | `browser.ts` | MSW browser setup |

---

## `models.hbs`

Generates `models.ts` — shared schemas used across all tags.

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `schemas` | array | | Shared schema list |
| `schemas[].name` | string | `Pet` | Schema name (PascalCase) |
| `schemas[].zod` | string | `z.object({ id: z.string() })` | Zod schema expression |
| `schemas[].tsType` | string | `{ id: string }` | Plain TypeScript type |
| `customCode` | string | | Preserved code between `CUSTOM CODE START/END` comments |

### Example

```hbs
{{#each schemas}}
export const {{name}}Schema = {{{zod}}};
export type {{name}} = z.infer<typeof {{name}}Schema>;
{{/each}}
```

Or without Zod:

```hbs
{{#each schemas}}
export type {{name}} = {{{tsType}}};
{{/each}}
```

---

## `types.hbs`

Generates `<tag>.types.ts` — tag-specific request/response types.

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `tag` | string | `pets` | OpenAPI tag name (lowercase) |
| `imports` | string[] | `["Pet"]` | Shared model names to import |
| `specificSchemas` | array | | Tag-local schemas |
| `specificSchemas[].name` | string | `CreatePetRequest` | Schema name |
| `specificSchemas[].zod` | string | | Zod expression |
| `specificSchemas[].tsType` | string | | Plain TS type |
| `operations` | array | | Operations for this tag |
| `operations[].typeNamePayload` | string | `PetsCreatePetPayload` | Request body type name |
| `operations[].typeNameParams` | string | `PetsListPetsParams` | Query params type name |
| `operations[].typeNameResponse` | string | `PetsListPetsResponse` | Response type name |
| `operations[].bodyType` | string | `Pet` | Body TypeScript type |
| `operations[].resType` | string | `Pet[]` | Response TypeScript type |
| `operations[].hasBody` | boolean | `true` | Has request body |
| `operations[].hasQuery` | boolean | `true` | Has query parameters |
| `operations[].queryParams` | array | | Query parameter details |
| `operations[].queryParams[].name` | string | `limit` | Parameter name |
| `operations[].queryParams[].required` | boolean | `false` | Is required |
| `operations[].queryParams[].tsType` | string | `number` | Parameter TS type |
| `modelsModulePath` | string | `../models/models` | Relative import path to models |
| `customCode` | string | | Preserved custom code |

### Example

```hbs
{{#if imports.length}}
import type { {{#each imports}}{{this}}{{#unless @last}}, {{/unless}}{{/each}} } from "{{{modelsModulePath}}}";
{{/if}}

{{#each operations}}
{{#if hasBody}}
export type {{typeNamePayload}} = {{{bodyType}}};
{{/if}}

{{#if hasQuery}}
export interface {{typeNameParams}} {
{{#each queryParams}}
  {{name}}{{#unless required}}?{{/unless}}: {{{tsType}}};
{{/each}}
}
{{/if}}

export type {{typeNameResponse}} = {{{resType}}};
{{/each}}
```

---

## `service.hbs`

Generates `<tag>.service.ts` — API service with one method per operation.

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `className` | string | `PetsService` | Service class name (PascalCase + "Service") |
| `tagPrefix` | string | `pets` | Tag prefix (lowercase) |
| `tagLowerCase` | string | `pets` | Same as tagPrefix |
| `exportsToReExport` | string[] | `["Pet", "PetsListPetsResponse"]` | Type names to re-export |
| `operations` | array | | Operation methods |
| `operations[].operationId` | string | `listPets` | OpenAPI operationId |
| `operations[].methodName` | string | `listPets` | Method name (camelCase) |
| `operations[].methodLower` | string | `get` | HTTP method (lowercase) |
| `operations[].hasBody` | boolean | `true` | Has request body |
| `operations[].hasQuery` | boolean | `true` | Has query parameters |
| `operations[].summary` | string | `List all pets` | OpenAPI summary |
| `operations[].description` | string | | OpenAPI description |
| `operations[].typeNamePayload` | string | `PetsCreatePetPayload` | Body type name |
| `operations[].typeNameParams` | string | `PetsListPetsParams` | Query params type name |
| `operations[].typeNameResponse` | string | `PetsListPetsResponse` | Response type name |
| `operations[].configType` | string | `AppRequestConfig` | Request config type |
| `operations[].isDelete` | boolean | `false` | Is DELETE method |
| `operations[].pathParams` | array | | Path parameters |
| `operations[].pathParams[].original` | string | `petId` | Original param name |
| `operations[].pathParams[].safe` | string | `petId` | Safe variable name |
| `operations[].urlStr` | string | `/pets/${petId}` | URL template with interpolation |
| `corePath` | string | `../../core` | Import path to core module |
| `typesModulePath` | string | `../types/pets.types` | Import path to types file |
| `serviceProviderTypesPath` | string | `../types` | Import path to provider types |
| `modelsModulePath` | string | `../models/models` | Import path to models |
| `customCode` | string | | Preserved custom code |

### Example (class-based)

```hbs
import { BaseService } from "{{{corePath}}}";
import type { {{{exportsToReExport}}} } from "{{{typesModulePath}}}";

export class {{className}} extends BaseService<{{tagPrefix}}> {
{{#each operations}}
  async {{methodName}}(
{{#each pathParams}}
    {{safe}}: string | number,
{{/each}}
{{#if hasBody}}
    body: {{typeNamePayload}},
{{/if}}
{{#if hasQuery}}
    params?: {{typeNameParams}},
{{/if}}
  ): Promise<{{typeNameResponse}}> {
    return this.client.request("{{methodLower}}", `{{{urlStr}}}`{{#if hasBody}}, body{{/if}});
  }
{{/each}}
}
```

### Example (functional)

```hbs
import { ApiError } from "{{{modelsModulePath}}}";

export async function {{methodName}}(
  // params...
): Promise<{{typeNameResponse}}> {
  const _res = await fetch(`{{methodLower}} {{{urlStr}}}`);
  if (!_res.ok) throw new ApiError("...", _res.status, "");
  return _res.json();
}
```

---

## `index.hbs`

Generates `index.ts` — provider barrel exports.

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `tags` | array | `[{tag: "pets", className: "PetsService", tagPrefix: "pets"}]` | All tags |
| `tags[].tag` | string | `pets` | Tag name |
| `tags[].tagPrefix` | string | `pets` | Tag prefix for filenames |
| `tags[].className` | string | `PetsService` | Service class name |
| `corePath` | string | `../../core` | Import path to core |
| `pluginsPath` | string | `./plugins` | Import path to plugins |
| `hasHooks` | boolean | `true` | Has hooks configured in `templateData.hook` |
| `customCode` | string | | Preserved custom code |

### Example

```hbs
{{#each tags}}
export * from "./{{this.tagPrefix}}.service";
{{/each}}
```

---

## `plugins-index.hbs`

Generates `plugins/index.ts` — plugin registry.

| Variable | Type | Description |
|----------|------|-------------|
| `plugins` | array | Plugin import info |
| `plugins[].name` | string | Plugin function name |
| `plugins[].path` | string | Import path |
| `hasAuthManager` | boolean | Has bearer auth manager |

> **Note:** If this template renders to just `export {}`, the file is skipped entirely.

---

## `msw/handlers.hbs`

Generates `<tag>.handlers.ts` — MSW mock handlers.

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `tag` | string | `pets` | Tag name (lowercase) |
| `capTag` | string | `Pets` | Tag name (PascalCase) |
| `tagLowerCase` | string | `pets` | Tag name for filenames |
| `handlers` | array | | Handler definitions |
| `handlers[].fnName` | string | `listPetsHandler` | Handler function name |
| `handlers[].httpMethod` | string | `get` | HTTP method |
| `handlers[].pathPattern` | string | `/pets` | URL path pattern |
| `handlers[].hasBody` | boolean | | Has request body |
| `handlers[].bodyTypeName` | string | `PetsCreatePetPayload` | Body type name |
| `handlers[].summary` | string | | Operation summary |
| `handlers[].mockResponse` | string | | Auto-generated mock JSON |
| `handlers[].customMockData` | string | | Custom mock data override |
| `handlers[].statusCode` | number | `200` | Response status code |
| `handlers[].hasError` | boolean | | Error simulation enabled |
| `handlers[].errorBody` | string | | Error response body |
| `handlers[].errorStatus` | number | | Error status code |
| `handlers[].delayMs` | number | | Response delay in ms |
| `typeImports` | string[] | `["PetsListPetsResponse"]` | Type names to import |
| `usesFaker` | boolean | | Uses Faker.js |
| `typesImportPath` | string | `../../services/pets.types` | Import path to types |

### Example

```hbs
export function get{{capTag}}Handlers(baseUrl: string = "") {
  return [
  {{#each handlers}}
    http.{{httpMethod}}(
      `{{#if ../baseUrl}}{{../baseUrl}}{{/if}}{{{pathPattern}}}`,
      async ({{#if hasBody}}{ request }{{/if}}) => {
        {{#if delayMs}}await delay({{delayMs}});{{/if}}
        return HttpResponse.json({{{mockResponse}}}, { status: {{statusCode}} });
      }
    ){{#unless @last}},{{/unless}}
  {{/each}}
  ];
}
```

---

## `msw/index.hbs`

Generates MSW handlers barrel.

| Variable | Type | Description |
|----------|------|-------------|
| `services` | array | Per-tag service info |
| `services[].tag` | string | Tag name (lowercase) |
| `services[].capTag` | string | Tag name (PascalCase) |
| `services[].tagLowerCase` | string | Tag name for filenames |

### Example

```hbs
{{#each services}}
import { get{{this.capTag}}Handlers } from "./{{this.tagLowerCase}}.handlers";
{{/each}}

export const getHandlers = (baseUrl: string = "") => [
{{#each services}}
  ...get{{this.capTag}}Handlers(baseUrl),
{{/each}}
];
```

---

## `msw/browser.hbs`

Generates MSW browser setup. No variables — static template.

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Service class | PascalCase tag + "Service" | `PetsService` |
| Type names | PascalCase tag + PascalCase method + suffix | `PetsListPetsResponse` |
| Method names | camelCase operationId | `listPets` |
| Schema names | PascalCase ref name | `Pet` |
| File names | lowercase tag | `pets.service.ts` |
| Handler functions | `get` + PascalCase tag + `Handlers` | `getPetsHandlers` |
| Handler fn names | operationId + `Handler` | `listPetsHandler` |

## Handlebars Naming Helpers

Available in all templates:

| Helper | Example Input | Output |
|--------|--------------|--------|
| `{{capitalize tag}}` | `pets` | `Pets` |
| `{{camelCase operationId}}` | `list-pets` | `listPets` |
| `{{pascalCase operationId}}` | `list-pets` | `ListPets` |
| `{{kebabCase operationId}}` | `listPets` | `list-pets` |
| `{{snakeCase operationId}}` | `listPets` | `list_pets` |
| `{{toLowerCase tag}}` | `Pets` | `pets` |
| `{{toUpperCase tag}}` | `pets` | `PETS` |
| `{{#ifEq a b}}...{{/ifEq}}` | | Conditional: equal |
| `{{#ifNeq a b}}...{{/ifNeq}}` | | Conditional: not equal |

## File Naming Configuration

Customize generated file names via `fileNaming` in config:

```js
// specshot.config.mjs
export default {
  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
      fileNaming: {
        models: "schemas.ts",                    // default: "models.ts"
        service: "{{pascalCase tag}}Service.ts", // default: "{{tag}}.service.ts"
        types: "{{pascalCase tag}}Types.ts",     // default: "{{tag}}.types.ts"
      },
    },
  },
};
```

### File Naming Context Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `tag` | `pets` | OpenAPI tag name |
| `tagPrefix` | `pets` | Lowercase tag |
| `className` | `PetsService` | Service class name |

## Import Path Variables

These are computed automatically based on `outputPaths` config:

| Variable | From → To | Default |
|----------|-----------|---------|
| `modelsModulePath` | types dir → models dir | `./models` |
| `serviceModelsModulePath` | services dir → models dir | `../models/models` |
| `typesModulePath` | services dir → types dir | `./pets.types` |
| `corePath` | services dir → core | `../../core` |
| `typesImportPath` | MSW dir → types dir | `../../services/pets.types` |

## Handlebars Tips

- Use `{{{variable}}}` (triple braces) for unescaped output (code, paths, Zod)
- Use `{{variable}}` (double braces) for escaped output (text, summaries)
- Custom helpers are registered (e.g. `capitalize`, `camelCase`, etc.) as documented above
- `{{#each}}`, `{{#if}}`, `{{#unless}}`, `{{#unless @last}}` are available
- Access parent context with `{{../variable}}`
