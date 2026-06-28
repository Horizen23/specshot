# specshot Remote URL Example

Generate API services from a running backend.

## Setup

```bash
npm install
```

## Try it out

**1. Start the mock server:**

```bash
npx tsx mock-server.ts
```

**2. In another terminal, generate services:**

```bash
npx specshot generate
```

Reads `openapiUrl` (`http://localhost:8080/openapi.json`) from `specshot.config.mjs` and fetches the spec live.

```javascript
/** @type {import('specshot').SpecshotConfig<TemplateData, Overrides>} */
export default {
  preset: "class",
  apis: {
    petstore: {
      openapiUrl: "http://localhost:8080/openapi.json",
    },
  },
  templateData: {
    hook: "none",
    pluginNames: [],
  },
};
```

**3. Run the example:**

```bash
npx tsx src/app.ts
```

## Manual generation

Use a local spec file instead:

```bash
npx specshot generate --file ../local-file/openapi.json --output src/lib/api/petstore/services
```

## Generated API

- `api.pets.listPets()` → `{ data: Pet[], error, ok }`
- `api.pets.createPet(payload)` → `{ data: Pet, error, ok }`
- `api.pets.getPet(petId)` → `{ data: Pet, error, ok }`
