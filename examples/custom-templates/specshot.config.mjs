/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  integration: "none",
  interceptors: ["bearer", "logger"],
  // Option A: Directory mode — all templates from one folder
  // templates: "./templates",

  // Option B: Per-file mode — override only specific templates,
  // the rest fall back to built-ins. Paths can point anywhere.
  templates: {
    models: "./templates/models.hbs",
    types: "./templates/types.hbs",
    service: "./templates/service.hbs",
    index: "./templates/index.hbs",
    "interceptors-index": "./templates/interceptors-index.hbs",
  },

  apis: {
    petstore: {
      providerDir: "src/lib/api/petstore",
      openapiUrl: "./openapi.json",
    },
  },
};
