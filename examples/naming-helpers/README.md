# Naming Helpers Example

Demonstrates Handlebars naming helpers + custom file naming.

## Setup

```bash
npm install
npm run specshot:generate
```

## What This Shows

### 1. Naming Helpers in Templates

All templates use naming helpers:

```hbs
{{pascalCase tag}}        → Pets
{{camelCase operationId}} → listPets
{{kebabCase operationId}} → list-pets
{{snakeCase operationId}} → list_pets
{{toUpperCase tag}}       → PETS
```

### 2. Custom File Naming

```js
// specshot.config.mjs
fileNaming: {
  models: "schemas.ts",
  service: "{{pascalCase tag}}Service.ts",
  types: "{{pascalCase tag}}Types.ts",
}
```

### Output

```
src/
├── index.ts
└── services/
    ├── PetsService.ts    ← {{pascalCase tag}}Service.ts
    ├── PetsTypes.ts      ← {{pascalCase tag}}Types.ts
    └── schemas.ts        ← custom models name
```

Import paths are automatically adjusted:
- `index.ts` → `export * from "./services/PetsService"`
- `PetsService.ts` → `import { ApiError } from "./schemas"`
- `PetsService.ts` → `import type { ... } from "./PetsTypes"`
