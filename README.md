# SpecShot

**One command. Zero dependencies. 100% type-safe API client.**

Drop an OpenAPI spec in, get production-ready TypeScript out. No SDKs to install. No generated bloat to maintain. You own every line — like shadcn/ui, but for your API layer.

---

### Why SpecShot?

| Instead of... | You get... |
|---|---|
| `fetch()` with no types | Fully typed `{ data, error, ok }` |
| `try/catch` everywhere | Clean result pattern |
| Manual Zod schemas | Auto-generated validation |
| Vendor lock-in | Code you own, edit, and extend |

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

```
specshot init              Scaffold API core into your project
specshot generate          Generate services from OpenAPI
specshot mock              Launch an interactive Mock Server and Dashboard
```

### `generate` options

| Flag | Description |
|---|---|
| `--url, -u <url>` | Remote OpenAPI spec URL |
| `--file, -f <path>` | Local OpenAPI JSON file |
| `--output, -o <dir>` | Output directory |
| `--alias, -a <alias>` | Import alias (e.g. `@/lib/api`) |
| `--config, -c <path>` | Custom config file path |
| `--templates, -t <dir>` | Custom Handlebars templates |
| `--dry-run` | Preview without writing files |

### `mock` options (Zero-config API Mocking)

SpecShot includes a powerful built-in mock server and Web Dashboard. 
No MSW or complex setup required. Just point it to your OpenAPI spec.

```bash
npx specshot mock --web --proxy http://localhost:3000
```

| Flag | Description |
|---|---|
| `--web` | Launch the beautiful Web Dashboard (SPA) |
| `--proxy, -p <url>` | Proxy un-mocked requests to a real backend |
| `--url, -u <url>` | Remote OpenAPI spec URL |
| `--file, -f <path>` | Local OpenAPI JSON file |
| `--port <number>` | Port for the mock API server |

### `specshot.json`

```json
{
  "coreDir": "src/lib/api/core",
  "providerDir": "src/lib/api/default",
  "integration": "swr",
  "plugins": ["bearer", "logger"],
  "openapiUrl": "http://localhost:8080/openapi.json"
}
```

---

## Examples

| Example | What it shows |
|---|---|
| [`examples/local-file`](examples/local-file) | Generate from a `openapi.json` on disk |
| [`examples/remote-url`](examples/remote-url) | Fetch from a running backend + mock server |
| [`examples/react-query`](examples/react-query) | Integration with `@tanstack/react-query` |
| [`examples/swr`](examples/swr) | Integration with `swr` for data fetching |
| [`examples/real-or-fake`](examples/real-or-fake) | Full-stack usage with the mock server |

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Built by the open-source community
