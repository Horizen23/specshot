# SpecShot Local File & Multi-API Example

Quick demo of SpecShot code generation using a local `openapi.json` file along with the **Multi-API** configuration pattern.

## Setup

Install dependencies and run the initialization script to generate the API services based on `specshot.config.mjs`:

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
/** @type {import('specshot').SpecshotConfig<TemplateData, Overrides>} */
export default {
  preset: "class",
  apis: {
    prestore: {
      openapiUrl: "openapi.json", // Uses local file
    },
  },
  templateData: {
    hook: "none",
    pluginNames: ["bearer", "logger"],
  },
};
```

## Usage

See `src/app.ts` for example usage.

Generated API:

- `api.pets.listPets()` → `{ data: Pet[], error, ok }`
- `api.pets.getPet(petId)` → `{ data: Pet, error, ok }`
- `api.pets.createPet(payload)` → `{ data: Pet, error, ok }`
