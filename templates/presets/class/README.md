# Class Preset for Specshot

The **`class`** preset is the default and most fully-featured code generator for Specshot. It generates a robust, object-oriented API client that wraps the native `fetch` API. It is designed to be highly extensible, type-safe, and developer-friendly.

---

## 🚀 Key Features & Architecture

- **Service-Based Architecture**: Endpoints are automatically grouped into classes based on their OpenAPI `tags`. You access them intuitively via a singleton (e.g., `api.auth.login()`, `api.users.getUsers()`).
- **Zod Runtime Validation**: Ensures the data returned from your backend matches your OpenAPI spec exactly. (Optionally bypassable for performance).
- **No More `try/catch`**: Uses a Golang/Rust inspired Result pattern `Promise<{ data, error, ok }>` for clean, linear error handling.
- **Global Interceptor / Plugin System**: Easily inject Headers, Auth Tokens, or global error handling (like Toast notifications) into all requests.
- **React Hooks Support**: Automatically generates `SWR` or `@tanstack/react-query` hooks for every `GET` endpoint.

---

## 📦 Installation & Setup

1. Initialize Specshot and choose the `class` preset:

```bash
npx specshot init
```

2. When prompted, select your desired features (e.g., Toast library, Plugins, Hooks).

3. **Install Dependencies**:
   Depending on the features you enabled during setup, you will need to install the corresponding packages in your project:

```bash
# Required ONLY if you selected `validation: "zod-runtime"` (which is the default)
npm install zod

# Optional: If you enabled React Query or SWR hooks
npm install @tanstack/react-query
# OR
npm install swr

# Optional: If you selected a Toast Library for global error handling
npm install sonner # (or react-toastify, sweetalert2, vue-toastification, react-hot-toast)
```

4. Generate the code:

```bash
npx specshot generate
```

---

## ⚙️ Configuration Options (`templateData`)

These options reside in your `specshot.config.mjs` file under `templateData`. You can modify them directly in the file and run `npx specshot generate` again to apply the changes.

#### `validation`

Controls how API responses are validated against your OpenAPI schema.

- **`"zod-runtime"`** (Default): Uses Zod to safely parse and validate incoming JSON. It automatically strips out unexpected fields from the server, ensuring your data exactly matches your TypeScript types. If the backend breaks the contract, the client catches it immediately. _(Requires `npm install zod`)_
- **`"types-only"`**: Only generates TypeScript `interface` definitions. Does not perform any runtime validation. This is slightly faster but sacrifices safety. Use this only if you fully trust your backend.

#### `hooks`

Generates data-fetching hooks for all `GET` endpoints, allowing you to easily bind API data to your UI components with built-in loading and error states.

- **`"swr"`**: Generates hooks tailored for Vercel's SWR (e.g. `useUsersGetUsers`). _(Requires `npm install swr`)_
- **`"react-query"`**: Generates hooks tailored for TanStack React Query. _(Requires `npm install @tanstack/react-query`)_
- **`"none"`**: Skips generating hooks entirely.

#### `pluginNames`

An array of built-in interceptor plugins to scaffold into your project.

- **`"bearer"`**: Scaffolds a complete Auth Manager with automatic `Authorization` header injection and built-in 401 Token Refresh & Request Retry logic.
- **`"logger"`**: Scaffolds a development logger that prints request/response details to the browser console.
- **`"request-id"`**: Automatically attaches a unique `X-Request-Id` UUID to every outgoing request.
- **`"circuit-breaker"`**: Scaffolds circuit breaker logic to temporarily stop calling endpoints if they fail repeatedly.

#### `toastLibrary`

Selects the UI library to use for the Global Toast Plugin. If enabled, any API request that fails (e.g., 400 or 500 status) will automatically trigger a pop-up notification with the extracted error message.

- **Supported options:** `"none"`, `"sonner"`, `"react-toastify"`, `"react-hot-toast"`, `"vue-toastification"`, `"sweetalert2"`.

---

## 📖 Comprehensive Usage Guide

### 1. Initializing the Client & Extractors

Before making requests, you need to configure the API Client. The `ApiClientBuilder` allows you to define how your specific backend formats data and errors.

```typescript
// src/lib/api/client.ts
import { createApiClientBuilder } from "./provider/client";

// The builder is pre-configured with default extractors, but you can override them:
const builder = createApiClientBuilder({
  baseUrl: "https://api.example.com/v1",
})
  .setDataExtractor((data) => {
    // Example: If your backend always wraps data in { "status": "success", "result": { ... } }
    return data?.result ?? data;
  })
  .setErrorExtractor((data) => {
    // Example: Grab the error message from { "error": { "message": "Invalid token" } }
    return data?.error?.message ?? "Unknown Error";
  });

export const api = builder.build();
```

### 2. Making API Requests (The Result Pattern)

Instead of using `try/catch` which creates nested scope issues, every endpoint returns a consistent `{ data, error, ok }` object.

```typescript
import { api } from "@/lib/api";

async function fetchUser(userId: string) {
  const { data, error, ok } = await api.users.getUserById({
    path: { id: userId },
  });

  if (!ok) {
    // `error` is strongly typed and includes the parsed error message from `setErrorExtractor`
    console.error("Failed:", error.message);
    return;
  }

  // `data` is strongly typed and validated by Zod!
  console.log("User Email:", data.email);
}
```

### 3. The Bearer Auth Plugin (Auto Token Refresh)

The `bearer` plugin automatically attaches `Authorization: Bearer <token>` to all requests. More importantly, it has **built-in 401 retry logic**.

```typescript
import { api } from "@/lib/api";

// Get the auth manager instance (Strongly typed automatically!)
const auth = api.plugin("auth");

// 1. Set token on Login
auth.setToken("ey...");

// 2. Clear token on Logout
auth.clearToken();

// 3. Configure Auto-Refresh!
// If a request returns 401, this function runs. If it returns a new token,
// the plugin will automatically retry the original request behind the scenes.
auth.refreshToken = async () => {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  if (res.ok) {
    const data = await res.json();
    auth.setToken(data.accessToken);
    return data.accessToken;
  }
  // Refresh failed, redirect to login
  window.location.href = "/login";
  return null;
};
```

You can bypass the auth header for specific requests (like login/signup):

```typescript
await api.auth.login({ body: { ... } }, { skip: { auth: true } });
```

### 4. The Global Toast Plugin

If you selected a Toast library, the client will automatically trigger a UI toast whenever an API request fails. The message displayed will be the one extracted by your `setErrorExtractor`.

**Silencing Toasts:**
For background requests (like polling) where you don't want to bother the user with error popups, use the `silent` configuration:

```typescript
await api.notifications.getUnreadCount(
  {},
  { silent: true }, // Disables global error toast for this specific request
);
```

### 5. API Request Cancellation

Every request made by the client returns a `CancelablePromise`. This means you can easily abort an in-flight request by calling `.cancel()` on the returned promise.

```typescript
import { api } from "@/lib/api";

const request = api.users.getUsers({ limit: 100 });

// If the user navigates away before the request finishes:
request.cancel("User navigated away");

// The promise resolves with `{ ok: false, error: ClientError("abort", ...) }`
const { ok, error } = await request;
if (!ok && error.name === "ClientError" && error.message === "abort") {
  console.log("Request was successfully cancelled.");
}
```

Alternatively, you can pass a standard native `AbortSignal` through the config object if you are wiring it up with other standard web APIs:

```typescript
const controller = new AbortController();

api.users.getUsers(
  { limit: 100 },
  { signal: controller.signal }, // Native fetch abort signal
);

// Later...
controller.abort();
```

### 6. Writing Custom Plugins

You can easily extend the client by writing your own interceptors.

```typescript
// plugins/custom-headers.ts
import type { ApiPlugin } from "../core/types";

export const customHeaderPlugin: ApiPlugin = {
  name: "custom-headers",
  onRequest: async (config, url) => {
    const headers = new Headers(config.headers);
    headers.set("X-App-Version", "1.0.0");
    headers.set("Accept-Language", navigator.language);

    return { ...config, headers };
  },
  onResponse: async (response, url, config) => {
    if (response.status === 503) {
      console.warn("Server is undergoing maintenance!");
    }
    return response; // Must return the response
  },
};

// Register it in your client setup:
// builder.addPlugin(customHeaderPlugin);
```

### 6. Using React Hooks (SWR / React Query)

If hook generation is enabled, Specshot generates ready-to-use hooks for all `GET` endpoints. These hooks handle caching, deduplication, and loading states automatically.

```tsx
import { useUsersGetUsers } from "@/lib/api/hooks";

function UserList() {
  // First argument: API parameters (path, query, etc.)
  // Second argument: Hook-specific options (e.g., SWR options or React Query options)
  const { data, isLoading, error } = useUsersGetUsers(
    { query: { role: "admin" } },
    { staleTime: 1000 * 60 * 5 }, // React Query option: Cache for 5 mins
  );

  if (isLoading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```
