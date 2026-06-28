# Template Authoring Guide

Create custom presets for the SpecShot template marketplace.

## Preset Types

SpecShot supports 3 types of presets. Run `specshot templates list` to see all available presets with their type.

| Type | Tag | Description | Location |
|------|-----|-------------|----------|
| **Built-in** | `[built-in]` | Ships with specshot | Inside the specshot package |
| **Community** | `[community]` | Installed from npm or GitHub | Installed into the specshot package dir |
| **Custom** | `[custom]` | Created by you in your project | `<project>/templates/presets/` |

### Built-in

The 3 default presets that come with specshot: `class`, `functional`, `zod-functional`. Cannot be removed.

### Community

Presets shared by the community via npm or GitHub. Install with:

```bash
specshot templates install github:user/repo
specshot templates install specshot-preset-xxx
```

Remove with:

```bash
specshot templates uninstall my-preset
```

### Custom

Create your own preset from scratch, or eject an existing preset to customize:

```bash
# Eject a built-in/community preset into your project
specshot templates eject functional    # copies to templates/presets/functional/
specshot templates eject zod-functional
specshot templates eject my-community-preset
```

After ejecting, edit any `.hbs` file in `templates/presets/<name>/`. The preset will appear as `[custom]` in `specshot templates list` automatically.

Or create from scratch:

```
<your-project>/templates/presets/my-custom/
├── _preset.json
└── repeatable/
    └── generator/
        └── ...your templates...
```

Custom presets appear in `specshot templates list` with the `[custom]` tag and are available immediately — no install step needed.

## Quick Start

```
templates/presets/my-preset/
├── _preset.json                    # Preset manifest (required for marketplace)
├── one-time/                       # Scaffold templates (installed once)
│   ├── core/                       #   Core files (api-client, base-service, etc.)
│   └── provider/                   #   Provider files (client.ts, hooks.ts)
└── repeatable/                     # Generated templates (regenerated on every build)
    ├── generator/                  #   API code templates
    │   ├── service-per-tag/
    │   │   ├── _target.hbs
    │   │   ├── _name.hbs
    │   │   ├── _iterate.hbs
    │   │   └── service.hbs
    │   ├── types-per-tag/
    │   └── index/
    └── msw/                        #   MSW mock handler templates (optional)
```

## Directory Structure

### `repeatable/` — Generated on every `specshot generate`

Contains template directories that are rendered once per matching data item. Each template directory produces one output file. The subdirectories under `repeatable/` are called **groups** — use `generator/` for API code and `msw/` for mock handlers.

### `one-time/` — Installed once via `specshot generate`

Contains scaffold templates that are copied to the project **only once** (first run). These are files the user will own and modify directly — base classes, type definitions, API client setup, etc.

- Files use the same `.hbs` template syntax as `repeatable/`
- Use `skipIfExists: true` — existing files are never overwritten
- Run `specshot generate` again to install (skips existing files)

## `_preset.json`

```json
{
  "name": "my-preset",
  "description": "My custom template preset",
  "features": ["Feature 1", "Feature 2"],
  "deps": ["zod"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique preset name (used as directory name) |
| `description` | string | Yes | Short description shown in `init` menu |
| `features` | string[] | No | List of features for marketplace listing |
| `deps` | string[] | No | npm dependencies this preset requires |

## Template Data Schema

Place `_template-data.schema.json` in any template directory to define variables that users configure during `specshot init`. Multiple schema files across directories are **merged** — properties with the same key are overwritten by the later file.

```json
{
  "title": "Template Configuration",
  "description": "Options for this preset",
  "properties": {
    "outDir": {
      "type": "string",
      "description": "Output directory for generated services",
      "default": "src/lib/api/services"
    }
  }
}
```

## Template Meta Files

Every template directory uses meta files to control output:

| File | Purpose | Example |
|------|---------|---------|
| `_target.hbs` | Output directory | `{{outputDir}}` |
| `_name.hbs` | Output filename | `{{tagPrefix}}.service.ts` |
| `_iterate.hbs` | Array key to iterate | `tags` |
| `_condition.hbs` | Skip condition | `skip` (returns "skip" to skip) |
| `_filter.hbs` | Allowed filenames | `service.hbs\ntypes.hbs` |

## Custom Code Markers

Templates can preserve user-written code across regenerations using markers:

```
// --- CUSTOM CODE START ---
const myCustomLogic = () => { ... };
// --- CUSTOM CODE END ---
```

The markers must be exactly `--- CUSTOM CODE START ---` and `--- CUSTOM CODE END ---` (any comment syntax is fine). On regeneration, code between these markers is preserved and injected back into the new output.

### `_target.hbs`

Compiles to the output directory path. Common values:

```hbs
{{outputDir}}          # Services output directory
{{outputDir}}/..       # Parent of output (for index.ts)
{{outputDir}}/../core  # Core directory
{{outputDir}}/../plugins  # Plugins directory
```

### `_name.hbs`

Compiles to the output filename. Common patterns:

```hbs
{{tagPrefix}}.service.ts       # pets.service.ts
{{tagPrefix}}.types.ts         # pets.types.ts
models.ts                      # Static name
index.ts                       # Static name
```

### `_iterate.hbs`

Returns the name of a key in the template data to iterate over:

```hbs
tags    # Iterates over data.tags array (one file per tag)
```

Each iteration spreads the item properties into the template context.

## Template Data

Templates receive this data object:

```typescript
{
  // User-defined from specshot.config.mjs templateData
  hook: "swr" | "react-query" | "none",
  pluginNames: ["bearer", "logger"],
  outDir: "src/lib/api/services",
  coreOut: "src/lib/api/core",

  // Built-in
  outputDir: "src/lib/api/services",  // relative from cwd
  importAlias: "@/lib/api",           // if --alias is set
  schemas: [                          // shared models (cross-tag)
    { name: "Pet", zod: "z.object({...})", tsType: "{ id: string; ... }" }
  ],
  sharedSchemas: [...],  // alias for schemas

  // Per-tag data (when iterating "tags")
  tags: [
    {
      name: "pets",                    // original tag name
      tag: "pets",                     // same as name
      tagPrefix: "pets",               // lowercase
      className: "PetsService",        // PascalCase + Service
      imports: ["Pet"],                // shared schemas used by this tag
      specificSchemas: [               // tag-only schemas
        { name: "CreatePetRequest", zod: "z.object({...})", tsType: "..." }
      ],
      operations: [
        {
          operationId: "listPets",
          methodName: "listPets",      // camelCase
          methodLower: "get",          // HTTP method lowercase
          hasBody: false,
          hasQuery: true,
          hasPathParams: false,
          summary: "List all pets",
          description: "Returns a paginated list...",
          typeNamePayload: null,       // if hasBody
          bodyType: "any",
          typeNameParams: "PetsListPetsParams",  // if hasQuery
          queryParams: [
            { name: "limit", required: false, tsType: "number" }
          ],
          typeNameResponse: "PetsListPetsResponse",
          resType: "Pet[]",
          pathParams: [],
          configType: "Omit<AppRequestConfig, 'params'> & { params?: PetsListPetsParams }",
          urlStr: "/pets",
          isDelete: false,
        }
      ],
      exportsToReExport: ["Pet", "CreatePetRequest", "PetsListPetsResponse"],
    }
  ],
}
```

### `enhanceData` (per-file)

Adds file-relative import paths:

```typescript
{
  coreRelPath: "../core",      // relative path from output file to core/
  typesRelPath: "../types",    // relative path from output file to types.ts
  customCode: "...",           // preserved custom code between markers
}
```

## Custom Code Markers

Templates can preserve user edits between re-generations:

```hbs
export class {{className}} extends BaseService {
  // --- CUSTOM CODE START ---
{{#if customCode}}
{{{customCode}}}
{{else}}
  // Add your custom methods here. Do not remove these comments.
{{/if}}
  // --- CUSTOM CODE END ---
}
```

## Template Variables Schema

Define expected variables in `_template-data.schema.json`:

```json
{
  "title": "My Preset Configuration",
  "description": "Configure the generated code",
  "properties": {
    "hook": {
      "type": "string",
      "description": "Which hooks framework to use",
      "enum": ["swr", "react-query", "none"],
      "default": "none"
    },
    "pluginNames": {
      "type": "array",
      "description": "Interceptor plugins to generate",
      "items": {
        "type": "string",
        "enum": ["bearer", "logger", "retry"]
      },
      "default": []
    },
    "strictMode": {
      "type": "boolean",
      "description": "Enable strict TypeScript mode",
      "default": false
    }
  }
}
```

Place this file anywhere in your preset tree. The `init` command will auto-discover it and generate prompts.

## Available Handlebars Helpers

| Helper | Usage | Example |
|--------|-------|---------|
| `capitalize` | First letter uppercase | `{{capitalize tag}}` → `Pets` |
| `camelCase` | camelCase | `{{camelCase tag}}` → `petStore` |
| `pascalCase` | PascalCase | `{{pascalCase tag}}` → `PetStore` |
| `kebabCase` | kebab-case | `{{kebabCase tag}}` → `pet-store` |
| `snakeCase` | snake_case | `{{snakeCase tag}}` → `pet_store` |
| `toLowerCase` | lowercase | `{{toLowerCase tag}}` → `pets` |
| `toUpperCase` | UPPERCASE | `{{toUpperCase tag}}` → `PETS` |
| `ifEq` | Equality check | `{{#ifEq tag 'pets'}}...{{/ifEq}}` |
| `ifNeq` | Not-equal check | `{{#ifNeq tag 'users'}}...{{/ifNeq}}` |
| `includes` | Array/string contains | `{{#if (includes imports 'Pet')}}...{{/if}}` |
| `concat` | Concatenate strings | `{{concat a b}}` |
| `hasFile` | File exists check | `{{#if (hasFile 'bearer.ts')}}...{{/if}}` |
| `scanPlugins` | Scan interceptors dir | `{{#each (scanPlugins)}}...{{/each}}` |
| `relPath` | Relative path | `{{relPath from to}}` |

## Sharing Your Preset

### Option 1: GitHub (easiest)

Just push your preset to a public GitHub repo. Users install with:

```bash
specshot templates install github:yourusername/your-preset-repo
# or shorthand
specshot templates install yourusername/your-preset-repo
# or full URL
specshot templates install https://github.com/yourusername/your-preset-repo
```

### Option 2: npm

Package your preset as an npm package:

```json
{
  "name": "specshot-preset-my-thing",
  "keywords": ["specshot", "specshot-preset"],
  "files": ["_preset.json", "repeatable/", "one-time/"]
}
```

Users install with:

```bash
npm install specshot-preset-my-thing
npx specshot templates install specshot-preset-my-thing
```

### Option 3: Direct copy

Copy the preset directory into `templates/presets/my-preset/` in your project.

## Validation

Validate your preset structure:

```bash
npx specshot templates validate --preset my-preset
```

This checks:
- `_preset.json` format
- Required directories exist
- Template files are present

## Testing Your Preset

### 1. Validate structure

```bash
npx specshot templates validate --preset my-preset
```

### 2. Dry-run generate

Create a minimal test spec and run:

```bash
# Create a minimal OpenAPI spec
cat > test-spec.json << 'EOF'
{
  "openapi": "3.0.0",
  "info": { "title": "Test API", "version": "1.0.0" },
  "paths": {
    "/items": {
      "get": {
        "tags": ["items"],
        "operationId": "listItems",
        "responses": { "200": { "description": "OK" } }
      }
    }
  }
}
EOF

# Dry-run with your preset
npx specshot generate --preset my-preset -f test-spec.json --dry-run
```

### 3. Full generate

```bash
npx specshot generate --preset my-preset -f test-spec.json -o ./test-output
```

### 4. Verify output

Check that generated files match your expectations. Clean up test output when done:

```bash
rm -rf test-output test-spec.json
```

## Example: Minimal Preset

```
templates/presets/minimal/
├── _preset.json
└── repeatable/
    └── generator/
        └── service-per-tag/
            ├── _target.hbs    →  {{outputDir}}
            ├── _name.hbs      →  {{tagPrefix}}.ts
            ├── _iterate.hbs   →  tags
            └── service.hbs    →  export const {{tagPrefix}} = { ... }
```

That's it. The renderer handles everything else.
