<p align="center">
  <img src="assets/logo.svg" alt="SpecShot Logo" width="300" />
</p>

# SpecShot

**One command. Zero dependencies. 100% type-safe API client.**

Drop an OpenAPI spec in, get production-ready TypeScript out. No SDKs to install. No generated bloat to maintain. You own every line — like shadcn/ui, but for your API layer.

---

### Why SpecShot?

| Instead of...           | You get...                        |
| ----------------------- | --------------------------------- |
| `fetch()` with no types | Fully typed `{ data, error, ok }` |
| `try/catch` everywhere  | Clean result pattern              |
| Manual Zod schemas      | Multi-mode auto-validation        |
| Vendor lock-in          | Code you own, edit, and extend    |

### What you get

- **Typed API client** — every endpoint, param, body, and response strictly typed
- **Multi-mode Validation** — `types-only` (zero deps), `zod-schemas`, or full `zod-runtime` validation
- **Result pattern** — `{ data, error, ok }` pattern. No exceptions. No guessing.
- **Plugin Architecture** — Easily extend the client. Bearer auth with auto-refresh and logger built-in.
- **Hooks ready** — optional SWR or TanStack React Query hooks out of the box
- **Zero deps (optional)** — generate pure fetch functions, or opt into Zod for runtime safety

---

## 30 Seconds

```bash
# 1. Scaffold the core
npx specshot init

# 2. Point at your spec
npx specshot generate --url http://localhost:8080/openapi.json

# 3. Use it
```

```typescript
import { clientApi, defaultClient } from "./lib/api/default";

// Override the base URL if needed
defaultClient.options.baseUrl = "https://api.myprod.com";

// Everything is typed — no generics, no casting
const { data, error, ok } = await clientApi.pets.listPets();
const { data: pet } = await clientApi.pets.getPet("abc123");
const result = await clientApi.pets.createPet({ name: "Buddy", species: "dog" });
```

That's it. No config files. No code generation pipelines. Just typed API calls.

---

## Commands

### 1. `init` (One-time setup)

Creates a `specshot.config.mjs` configuration file with your preferences. No files are installed — `generate` handles all installation.

**Interactive mode:**

```bash
npx specshot init
```

**Non-interactive mode (CI/CD friendly):**

```bash
npx specshot init \
  --preset class \
  --url http://localhost:8080/openapi.json
```

| Flag                    | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `--preset <name>`       | Preset: `class`, `functional`, or community/custom      |
| `--templates, -t <dir>` | Custom Handlebars templates directory                   |
| `--url, -u <url>`       | OpenAPI JSON URL to save in config for later generation |

### 2. `generate` (Run repeatedly on API updates)

Installs the API core infrastructure (if missing), then reads your OpenAPI spec to generate strictly-typed API services, Zod schemas, and models.

#### Presets

Choose a built-in code style with `--preset`:

| Preset            | Style                                          | Dependencies | Result pattern                 |
| ----------------- | ---------------------------------------------- | ------------ | ------------------------------ |
| `class` (default) | `BaseService` + `ApiClient` + Zod              | `zod`        | `Promise<{ data, error, ok }>` |
| `functional`      | Standalone `async function` + native `fetch()` | none         | `Promise<T>` (throws on error) |

```bash
npx specshot generate --preset functional
```

Or set it in config:

```javascript
export default {
  preset: "functional",
  apis: { ... }
};
```

If you already provided a `--url` during `init` (which saves it to `specshot.config.mjs`), you can simply run:

```bash
npx specshot generate
```

_(No flags or prompts required! Perfect for an `npm run api:sync` script.)_

Or, if you want to override the source:

```bash
npx specshot generate --url http://localhost:8080/openapi.json
```

**Auto-install:** When using built-in templates, `generate` automatically installs the API Core (`ApiClient`, `BaseService`, types) and Provider skeleton (`client.ts`, plugins, hooks) if they don't already exist. When using custom templates, infrastructure installation is skipped.

### `generate` options

| Flag                    | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `--url, -u <url>`       | Remote OpenAPI spec URL                        |
| `--file, -f <path>`     | Local OpenAPI JSON file                        |
| `--output, -o <dir>`    | Output directory                               |
| `--alias, -a <alias>`   | Import alias (e.g. `@/lib/api`)                |
| `--config, -c <path>`   | Custom config file path                        |
| `--templates, -t <dir>` | Custom Handlebars templates (partial override) |
| `--preset <name>`       | Built-in preset: `class`, `functional`         |
| `-w, --watch`           | Watch for changes and auto-regenerate          |
| `--dry-run`             | Preview without writing files                  |
| `--msw`                 | Generate MSW mock handlers                     |

### 3. `templates` (Manage Handlebars templates)

Subcommands for template management:

#### `templates eject`

Copies a built-in or community preset to your project as a custom preset so you can customize it. Only the templates you edit will override the built-ins — missing files automatically fall back to defaults.

```bash
npx specshot templates eject class
npx specshot templates eject functional --output ./my-templates
```

| Flag                 | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `--output, -o <dir>` | Output directory (default: `.specshot/templates/presets/`) |
| `--generator-only`   | Eject only generator templates                             |
| `--msw-only`         | Eject only MSW templates                                   |

#### `templates list`

Shows all available templates and their current override status (built-in / dir override / per-file override).

```bash
npx specshot templates list
```

#### `templates context <name>`

Shows all available variables and naming helpers for a specific template.

```bash
npx specshot templates context service
npx specshot templates context models
```

#### `templates install <package>`

Install a community preset from npm or GitHub:

```bash
npx specshot templates install github:user/my-preset
```

#### `templates uninstall <preset>`

Remove an installed community preset:

```bash
npx specshot templates uninstall my-preset
```

#### `templates validate`

Validate preset structure and `_preset.json` for community templates:

```bash
npx specshot templates validate
```

Then generate with your custom templates:

```bash
npx specshot generate --templates ./my-templates
```

#### Template structure

```
my-templates/
  models.hbs              # Generator: shared Zod schemas + types
  types.hbs               # Generator: per-tag request/response types
  service.hbs             # Generator: per-tag service class
  index.hbs               # Generator: provider index + clientApi export
  plugins-index.hbs       # Generator: plugin auto-wiring
  msw/
    handlers.hbs          # MSW: per-tag http.<method>() handlers
    index.hbs             # MSW: handler barrel export
    browser.hbs           # MSW: setupWorker entry
```

#### Partial override

You don't need to copy all templates. Place only the files you want to customize in your override directory. Any missing file will use the built-in default automatically.

For example, to customize only the service template:

```
my-templates/
  service.hbs    # Your custom version
```

```bash
npx specshot generate --templates ./my-templates
# models.hbs, types.hbs, index.hbs → built-in defaults
# service.hbs → your custom version
```

#### Template context

Templates use standard [Handlebars](https://handlebarsjs.com/) syntax. Key variables available:

| Template       | Context variables                                                                     |
| -------------- | ------------------------------------------------------------------------------------- |
| `models.hbs`   | `schemas` (shared), `version`, `customCode`                                           |
| `types.hbs`    | `tag`, `imports`, `specificSchemas`, `operations`, `customCode`                       |
| `service.hbs`  | `className`, `tagPrefix`, `exportsToReExport`, `operations`, `corePath`, `customCode` |
| `index.hbs`    | `services`, `corePath`, `pluginsPath`, `customCode`                                   |
| `handlers.hbs` | `tag`, `tagLowerCase`, `handlers`, `typeImports`, `usesFaker`, `typesImportPath`      |

Each generated file preserves a `// --- CUSTOM CODE START ---` / `// --- CUSTOM CODE END ---` block so your hand-written code survives regeneration.

#### Handlebars naming helpers

Custom templates can use built-in naming helpers:

| Helper        | Example input                         | Output              |
| ------------- | ------------------------------------- | ------------------- |
| `capitalize`  | `pets`                                | `Pets`              |
| `camelCase`   | `pet-store`                           | `petStore`          |
| `pascalCase`  | `pet-store`                           | `PetStore`          |
| `kebabCase`   | `PetStore`                            | `pet-store`         |
| `snakeCase`   | `PetStore`                            | `pet_store`         |
| `toLowerCase` | `PetStore`                            | `petstore`          |
| `toUpperCase` | `petstore`                            | `PETSTORE`          |
| `ifEq`        | `{{#ifEq tag "pets"}}...{{/ifEq}}`    | Conditional block   |
| `ifNeq`       | `{{#ifNeq tag "users"}}...{{/ifNeq}}` | Negated conditional |

#### File naming configuration

Control generated file names via `fileNaming` in config:

```javascript
export default {
  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
      fileNaming: {
        models: "schemas", // → schemas.ts
        service: "{{pascalCase tag}}Service", // → PetsService.ts
        types: "{{pascalCase tag}}Types", // → PetsTypes.ts
        index: "index", // → index.ts
      },
    },
  },
};
```

#### Custom output paths

Control WHERE generated files go via `outputPaths` in config:

```javascript
export default {
  apis: {
    default: {
      openapiUrl: "./openapi.json",
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

Import paths between files are computed automatically. See [`docs/template-variables.md`](docs/template-variables.md) for full reference.

#### Editor autocompletion

SpecShot provides autocompletion for both config files and templates:

**Config files (`specshot.config.mjs`):**

```javascript
/**
 * @typedef {Object} TemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Hooks framework
 * @property {("bearer" | "logger")[]} [pluginNames] - Interceptor plugins
 * @property {"types-only" | "zod-schemas" | "zod-runtime"} [validation] - Validation strictness mode
 */
/** @type {import('specshot').SpecshotConfig<TemplateData>} */
export default {
  // Autocompletion works in VS Code with the TypeScript language server
  preset: "functional",
  apis: {/* ... */},
  templateData: {
    hook: "none",
    pluginNames: [],
    validation: "zod-runtime",
  },
};
```

For JSON config files (`specshot.config.json`), add a `$schema` reference:

```json
{
  "$schema": "https://specshot.dev/config.schema.json",
  "preset": "functional"
}
```

**Template files (`.hbs`):**

- Run `specshot templates context <name>` to see available variables in the CLI
- See [`docs/template-variables.md`](docs/template-variables.md) for the full reference

### `mock` (Zero-config API Mocking)

SpecShot includes a powerful built-in mock server and **Web Dashboard**. No MSW or complex setup required.

```bash
npx specshot mock --web --proxy http://localhost:3000
```

| Flag                | Description                                  |
| ------------------- | -------------------------------------------- |
| `--web`             | Launch the interactive Web Dashboard (SPA)   |
| `--proxy, -p <url>` | Proxy un-mocked requests to a real backend   |
| `--port <number>`   | Port for the mock API server (default: 3457) |
| `--no-open`         | Prevent opening the browser automatically    |

#### 🎛️ Mock Dashboard Features

When you run with `--web`, SpecShot opens a beautiful dashboard where you can:

- **Toggle Endpoints**: Turn mock responses on/off per endpoint.
- **Set Latency & Errors**: Simulate slow networks or 500/400 error states instantly.
- **Customize Data (Faker.js)**: Use the searchable dropdown to map specific JSON fields to Faker.js functions (e.g., `internet.email`, `image.url`).
- **Manual Overrides**: Write custom JSON payloads directly in the browser.
- **WebSocket Mocking**: Configure WebSocket endpoints and push events to connected clients in real-time from the dashboard.

_(Mock configurations and overrides are automatically saved to `.specshot/mocks.json` so your team can share the same mock state!)_

### `specshot.config.mjs`

```javascript
/**
 * @typedef {Object} TemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Hooks framework
 * @property {("bearer" | "logger")[]} [pluginNames] - Interceptor plugins
 * @property {"types-only" | "zod-schemas" | "zod-runtime"} [validation] - Validation strictness mode
 */
/**
 * @typedef {Object} Overrides
 * @property {string} [dir]
 * @property {string} [browser]
 * @property {string} [core]
 * @property {string} [handlerPerTag]
 * @property {string} [index]
 * @property {string} [plugins]
 * @property {string} [provider]
 * @property {string} [servicePerTag]
 * @property {string} [typesPerTag]
 */
/** @type {import('specshot').SpecshotConfig<TemplateData, Overrides>} */
export default {
  preset: "class", // class or functional
  templates: "src/lib/api/templates", // string (dir) or object (per-file)

  // Custom Faker.js plugins for mock generation
  fakerPlugins: [
    {
      name: "custom-image",
      match: (ctx) => ctx.path.endsWith("imageUrl"),
      generate: (faker) => faker.image.url(),
    },
  ],

  // Template data passed to all templates
  templateData: {
    hook: "swr", // swr, react-query, or none
    pluginNames: ["bearer", "logger"], // plugins to generate
    validation: "zod-runtime", // strict runtime data validation
  },

  // Define your APIs
  apis: {
    petstore: {
      // openapiUrl supports:
      // 1. Backend URL (e.g., "http://localhost:8080/openapi.json")
      // 2. Local File (e.g., "./openapi.json")
      openapiUrl: "http://localhost:8080/openapi.json",
    },
    payment: {
      openapiUrl: "http://api.staging.com/payment/openapi.json",
    },
  },
};
```

---

## Examples

| Example                                                | What it shows                                          |
| ------------------------------------------------------ | ------------------------------------------------------ |
| [`examples/local-file`](examples/local-file)           | Generate from a `openapi.json` on disk                 |
| [`examples/remote-url`](examples/remote-url)           | Fetch from a running backend + mock server             |
| [`examples/real-or-fake`](examples/real-or-fake)       | Full-stack usage with the mock server                  |
| [`examples/design-patterns`](examples/design-patterns) | Singleton, Factory, Observer, Builder service patterns |

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Built by the open-source community
