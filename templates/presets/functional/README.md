# Functional Preset for Specshot

The **`functional`** preset generates a lightweight, standalone, and class-free API client for Specshot. It prioritizes simplicity, zero dependencies, and standard TypeScript patterns. It is designed for developers who prefer bare-metal `fetch()` wrappers without the overhead of heavy abstractions or validation libraries.

---

## 🚀 Key Features & Architecture

- **Standalone Functions (No Classes)**: Endpoints are generated as simple, exportable `async` functions (e.g., `listPets()`, `createStore()`) rather than being bound to a class instance.
- **Zero Runtime Dependencies**: Uses standard native `fetch()` under the hood. You do not need to install `zod`, Axios, or any other third-party libraries.
- **Plain TypeScript Types**: Generates standard TypeScript interfaces and types for your Request/Response schemas instead of Zod schemas.
- **Standard `try/catch` Error Handling**: Throws a custom `ApiError` class on non-2xx responses. You handle errors exactly as you would with standard Promises.
- **Global Configuration**: Provides a simple `setBaseUrl()` function to configure your API endpoint globally across all your services.

---

## 📦 Installation & Setup

1. Initialize Specshot and choose the `functional` preset:

```bash
npx specshot init
```

_(Select `functional` when prompted for the preset type)_

2. **No Dependencies Required!**
   Unlike the `class` preset, the `functional` preset does not require installing `zod` or any other runtime packages.

3. Generate the code:

```bash
npx specshot generate
```

---

## 💻 Usage Guide

Once generated, the code is extremely straightforward to use.

### 1. Configure the Base URL

Before making any requests, you need to set the base URL. This is done once, typically in your app's entry point (e.g., `main.ts`, `App.tsx`, `index.js`).

```typescript
import { setBaseUrl } from "./src/lib/api/your-api-name";

// Set this once globally
setBaseUrl("https://api.example.com/v1");
```

### 2. Making Requests

You can import functions directly from the generated barrel file or from individual service files, and use standard `try/catch` for error handling.

```typescript
import { listPets, createPet, ApiError } from "./src/lib/api/your-api-name";

async function fetchMyPets() {
  try {
    // 1. GET Request with Query Parameters
    const pets = await listPets({ limit: 10, status: "available" });
    console.log(pets); // pets is fully typed!

    // 2. POST Request with a Body
    const newPet = await createPet({ name: "Fluffy", type: "dog" });
    console.log("Created:", newPet);
  } catch (error) {
    if (error instanceof ApiError) {
      // ApiError contains the status code and the raw text response
      console.error(`API failed with status ${error.status}:`, error.body);
    } else {
      console.error("An unexpected network error occurred:", error);
    }
  }
}
```

### 3. Customizing the Fetch Call (Headers, AbortSignals)

Every generated function accepts an optional `init?: RequestInit` as its final parameter. This allows you to effortlessly pass custom headers, authorization tokens, or abort signals directly to the underlying `fetch()` call.

```typescript
import { getPetById } from "./src/lib/api/your-api-name";

async function fetchWithAuth(petId: number) {
  const abortController = new AbortController();

  const pet = await getPetById(petId, {
    // Inject Custom Headers
    headers: {
      Authorization: `Bearer YOUR_ACCESS_TOKEN`,
      "X-Custom-Header": "MyValue",
    },
    // Pass an AbortSignal for request cancellation
    signal: abortController.signal,
  });

  return pet;
}
```

---

## 🛠️ Customizing the Templates (Custom Code)

The `functional` preset supports Specshot's **Custom Code Block** (`// --- CUSTOM CODE START ---`) feature out of the box.

If you need to add custom utility functions, manual type definitions, or custom API endpoints, simply write them between the magic comments in the generated files. Specshot will preserve your code during the next generation.

```typescript
// --- CUSTOM CODE START ---
export async function getPetsWithDelay() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return listPets();
}
// --- CUSTOM CODE END ---
```
