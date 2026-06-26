export default {
  integration: "none",

  // Shared templates (models, types, index, interceptors-index)
  // Only service.hbs changes per pattern — use --template-service flag
  templates: {
    models: "./templates/shared/models.hbs",
    types: "./templates/shared/types.hbs",
    index: "./templates/shared/index.hbs",
    "interceptors-index": "./templates/shared/interceptors-index.hbs",
  },

  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
      providerDir: "src/lib/api/petstore",
    },
  },
};
