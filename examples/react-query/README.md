# SpecShot React Query Example

Demonstrates SpecShot generated API client with **TanStack Query (React Query)** hooks for the Petstore API.

## What's included

- **Typed API client** — Generated from `openapi.json` using the SpecShot CLI
- **React Query hooks** — Auto-magical `useApi.pets.listPets()` style hooks via Proxy
- **Mutation support** — `useMutation` examples with query invalidation
- **Bearer auth interceptor** — Auto-attaches Authorization header with 401 refresh
- **3 services** — `pets`, `store`, `user` — each with fully typed methods

## How it was generated

Install dependencies and run the initialization script to generate the API core and provider code based on `specshot.config.mjs`:

```bash
npm install
npm run specshot:init
```

If the API spec changes later, you can update just the services by running:

```bash
npm run specshot:generate
```

You can also test the built-in mock server:

```bash
npm run specshot:mock
```

## Configuration

This project is configured using `specshot.config.mjs`:

```javascript
export default {
  coreDir: "src/lib/api/core",
  providerDir: "src/lib/api/petstore",

  integration: "react-query",
  interceptors: ["bearer", "logger"],
};
```

## Usage

### Queries (useQuery)

```tsx
import { useApi } from "./lib/api/petstore/index";

export function PetList() {
  // Auto-magical React Query hook — fully typed!
  const { data: pets, error, isLoading } = useApi.pets.listPets();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {pets?.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}
```

### With path params

```tsx
const { data: pet } = useApi.pets.getPet("pet-123");
```

### Mutations + Query Invalidation

```tsx
import { useMutation } from "@tanstack/react-query";
import { useApi, browserApi } from "./lib/api/petstore/index";

export function CreatePetForm() {
  const mutation = useMutation({
    mutationFn: (data) =>
      browserApi.pets.createPet(data).then((r) => {
        if (!r.ok) throw r.error;
        return r.data;
      }),
    onSuccess: () => {
      // Invalidate the pets list — triggers automatic refetch
      useApi.pets.listPets.invalidate();
    },
  });

  return (
    <button onClick={() => mutation.mutate({ name: "Buddy" })}>
      Create Pet
    </button>
  );
}
```

### Query Key Factory

```tsx
import { queryKeys } from "./lib/api/petstore/hooks";

// queryKeys.method("pets", "listPets") → ["api", "pets", "listPets"]
// queryKeys.service("pets")          → ["api", "pets"]
```

### Key features of React Query integration

| Feature                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `useApi.pets.listPets()` | Auto-generated query key: `["pets", "listPets"]`  |
| `useApi.pets.getPet(id)` | Query key includes args: `["pets", "getPet", id]` |
| `.queryKey(...)`         | Access the query key directly                     |
| `.invalidate()`          | Invalidate all queries for this method            |
| `queryKeys`              | Query key factory for manual cache operations     |

## Project structure

```
src/
├── app.tsx                          # Example React components
└── lib/
    └── api/
        ├── core/                    # Framework-agnostic HTTP client
        │   ├── api-client.ts
        │   ├── base-service.ts
        │   └── types.ts
        └── default/                 # Generated API + provider layer
            ├── client.ts
            ├── hooks.ts             # React Query proxy hooks
            ├── index.ts
            ├── types.ts
            ├── interceptors/
            │   ├── bearer.ts
            │   ├── bearer-auth-manager.ts
            │   └── index.ts
            └── services/
                ├── models.ts
                ├── pets.service.ts
                ├── pets.types.ts
                ├── store.service.ts
                ├── store.types.ts
                ├── user.service.ts
                └── user.types.ts
```
