# SpecShot SWR Example

Demonstrates SpecShot generated API client with **SWR** React hooks for the Petstore API.

## What's included

- **Typed API client** — Generated from `openapi.json` using the SpecShot CLI
- **SWR hooks** — Auto-magical `useApi.pets.listPets()` style hooks via Proxy
- **Bearer auth interceptor** — Auto-attaches Authorization header with 401 refresh
- **3 services** — `pets`, `store`, `user` — each with fully typed methods

## How it was generated

```bash
npx specshot generate \
  --file ./openapi.json \
  --integration swr \
  --plugins bearer \
  --output src/lib/api/default
```

## Usage

```tsx
import { useApi } from "./lib/api/default/index";

export function PetList() {
  // Auto-magical SWR hook — fully typed!
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

### Mutations (manual)

```tsx
import { browserApi } from "./lib/api/default/index";

await browserApi.pets.createPet({ name: "Buddy", tag: "dog" });
// Then revalidate:
useApi.pets.listPets.mutate();
```

### Key features of SWR integration

| Feature | Description |
|--------|------------|
| `useApi.pets.listPets()` | Auto-generated cache key: `["pets", "listPets"]` |
| `useApi.pets.getPet(id)` | Cache key includes args: `["pets", "getPet", id]` |
| `.key(...)` | Access the cache key directly |
| `.mutate(...)` | Optimistically update or revalidate the cache |

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
            ├── hooks.ts             # SWR proxy hooks
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
