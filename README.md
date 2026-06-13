# ⚡ SpecShot

SpecShot is a zero-dependency, ultra-fast, strictly-typed API Client Generator for TypeScript. Inspired by `shadcn/ui`, it doesn't wrap your fetch requests in opaque dependencies. Instead, it **injects** the core API logic directly into your project, giving you 100% control over how requests, intercepts, and errors are handled.

### Features
- **shadcn/ui style**: No `node_modules` lock-in for the core logic. You own the code.
- **Go/Rust-style Result Pattern**: Bye-bye `try/catch`. Every method returns `{ data, error, ok }`.
- **Runtime Validation**: Automatically generates Zod schemas for your API models, allowing you to validate payloads at runtime if you choose to.
- **Isomorphic**: Uses native Web `fetch`, works seamlessly on the client and server.
- **Auto-Magic SWR/React Query Support**: Ready to be wrapped by your favorite data-fetching libraries.

---

## 🚀 Quick Start

### 1. Initialize the Core
Run the init command inside your project:
```bash
npx specshot init
```
*This will copy the Agnostic Core files into your codebase (default: `src/lib/api/core`).*

### 2. Generate Your Services
Run the generator against your OpenAPI specs:
```bash
npx specshot generate -u http://localhost:8080/openapi.json -o src/lib/api/services
```

With import alias (preferred for Next.js/TS path aliases):
```bash
npx specshot generate -u http://localhost:8080/openapi.json -o src/lib/api/services -a @/lib/api
```
*This will generate strongly-typed Services, Types, and Zod Schemas with clean alias imports.*

---

## 🛠 Usage Example

### Creating the Client
Create an index file (e.g. `src/lib/api/client.ts`) and instantiate the generated services:
```typescript
import { ApiClient } from "./core/ApiClient";
import { FleetService } from "./services/fleet.service";

export const apiClient = new ApiClient({ baseUrl: "https://api.example.com" });

// Setup Interceptors
apiClient.interceptors.request.use(async (config) => {
  config.headers.set("Authorization", "Bearer token");
  return config;
});

// Export Services
export const api = {
  fleet: new FleetService(apiClient),
};
```

### Making a Request
```typescript
import { api } from "@/lib/api/client";
import { TruckSchema } from "@/lib/api/services/fleet.types";

async function fetchTruck(id: string) {
  const { data, error, ok } = await api.fleet.getTruck(id, {
    responseSchema: TruckSchema // Optional: Validates the response at runtime!
  });

  if (!ok) {
    console.error("Error:", error.message);
    return;
  }

  console.log("Truck data:", data);
}
```

## Built by the open-source community 🚀
