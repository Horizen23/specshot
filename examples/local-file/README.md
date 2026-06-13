# specshot Local File Example

Quick demo of specshot code generation.

## Setup
```bash
npm install
npx specshot generate --file ./openapi.json --output src/lib/api/default/services
```

## Usage
See `src/app.ts` for example usage.

Generated API:
- `api.pets.listPets()` → `{ data: Pet[], error, ok }`
- `api.pets.getPet(petId)` → `{ data: Pet, error, ok }`
- `api.pets.createPet(payload)` → `{ data: Pet, error, ok }`
