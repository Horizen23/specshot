# SpecShot

**One command. Zero dependencies. 100% type-safe API client.**

Drop an OpenAPI spec in, get production-ready TypeScript out. No SDKs to install. No generated bloat to maintain. You own every line — like shadcn/ui, but for your API layer.

---

### Why SpecShot?

| Instead of...           | You get...                        |
| ----------------------- | --------------------------------- |
| `fetch()` with no types | Fully typed `{ data, error, ok }` |
| `try/catch` everywhere  | Clean result pattern              |
| Manual Zod schemas      | Auto-generated validation         |
| Vendor lock-in          | Code you own, edit, and extend    |

### What you get

- **Typed API client** — every endpoint, param, body, and response strictly typed
- **Zod schemas** — optional runtime validation, auto-generated from your spec
- **Result pattern** — `{ data, error, ok }` pattern. No exceptions. No guessing.
- **Plugins** — Bearer auth with auto-refresh, request logging built-in
- **SWR ready** — optional React hooks out of the box
- **Zero deps** — your generated code depends on nothing

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
import { createApi } from "./lib/api/default";

const api = createApi(/* your client */);

// Everything is typed — no generics, no casting
const { data, error, ok } = await api.pets.listPets();
const { data: pet } = await api.pets.getPet("abc123");
const result = await api.pets.createPet({ name: "Buddy", species: "dog" });
```

That's it. No config files. No code generation pipelines. Just typed API calls.

---

## Commands

### 1. `init` (One-time setup)

Scaffolds the API core infrastructure, including your base client, React hooks, and **Built-in Interceptors** (like Bearer Auth or Logger).
_This code is meant to be yours. You can edit the interceptors or client logic._

**Interactive mode:**

```bash
npx specshot init
```

**Non-interactive mode (CI/CD friendly):**

```bash
npx specshot init \
  --core-dir src/lib/api/core \
  --provider-dir src/lib/api/default \
  --integration react-query \
  --interceptors bearer,logger \
  --url http://localhost:8080/openapi.json
```

| Flag                        | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `--core-dir <dir>`          | Directory to install the API Core                     |
| `--provider-dir <dir>`      | Directory to install the API Provider skeleton        |
| `--integration <type>`      | `swr`, `react-query`, or `none`                       |
| `--interceptors, -i <list>` | Comma-separated list (e.g. `bearer,logger`) or `none` |
| `--templates, -t <dir>`     | Custom Handlebars templates directory                 |
| `--url, -u <url>`           | OpenAPI JSON URL to auto-generate services after init |

### 2. `generate` (Run repeatedly on API updates)

Reads your OpenAPI spec to generate strictly-typed API services, Zod schemas, and models.
_It also Auto-discovers any Interceptors in your folder and wires them up automatically!_

If you already provided a `--url` during `init` (which saves it to `specshot.config.mjs`), you can simply run:

```bash
npx specshot generate
```

_(No flags or prompts required! Perfect for an `npm run api:sync` script.)_

Or, if you want to override the source:

```bash
npx specshot generate --url http://localhost:8080/openapi.json
```

### `generate` options

| Flag                       | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `--url, -u <url>`          | Remote OpenAPI spec URL                        |
| `--file, -f <path>`        | Local OpenAPI JSON file                        |
| `--output, -o <dir>`       | Output directory                               |
| `--alias, -a <alias>`      | Import alias (e.g. `@/lib/api`)                |
| `--config, -c <path>`      | Custom config file path                        |
| `--templates, -t <dir>`    | Custom Handlebars templates                    |
| `--interceptors, -i <dir>` | Custom interceptors directory (Auto-discovery) |
| `--dry-run`                | Preview without writing files                  |

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

_(Mock configurations and overrides are automatically saved to `.specshot/mocks.json` so your team can share the same mock state!)_

### `specshot.config.mjs`

```javascript
/** @type {import('specshot').SpecshotConfig} */
export default {
  // Global defaults
  coreDir: "src/lib/api/core",
  integration: "swr", // swr, react-query, or none
  interceptors: ["bearer", "logger"],
  templates: "src/lib/api/templates",

  // Custom Faker.js plugins for mock generation
  fakerPlugins: [
    {
      name: "custom-image",
      match: (ctx) => ctx.path.endsWith("imageUrl"),
      generate: (faker) => faker.image.url(),
    },
  ],

  // Define your APIs
  apis: {
    default: {
      providerDir: "src/lib/api/default",
      // openapiUrl supports:
      // 1. Backend URL (e.g., "http://localhost:8080/openapi.json")
      // 2. Local File (e.g., "./openapi.json")
      openapiUrl: "http://localhost:8080/openapi.json",
    },
    payment: {
      providerDir: "src/lib/api/payment",
      openapiUrl: "http://api.staging.com/payment/openapi.json",
    },
  },
};
```

---

## Examples

| Example                                          | What it shows                              |
| ------------------------------------------------ | ------------------------------------------ |
| [`examples/local-file`](examples/local-file)     | Generate from a `openapi.json` on disk     |
| [`examples/remote-url`](examples/remote-url)     | Fetch from a running backend + mock server |
| [`examples/react-query`](examples/react-query)   | Integration with `@tanstack/react-query`   |
| [`examples/swr`](examples/swr)                   | Integration with `swr` for data fetching   |
| [`examples/real-or-fake`](examples/real-or-fake) | Full-stack usage with the mock server      |

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Built by the open-source community
