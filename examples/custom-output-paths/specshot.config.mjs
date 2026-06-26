export default {
  // No core dir needed — custom template uses native fetch, no ApiClient/BaseService
  integration: "none",
  // No interceptors — functional approach doesn't use plugins

  // Custom templates — functional fetch API, no Zod, no interceptors
  templates: "./templates",

  apis: {
    petstore: {
      openapiUrl: "./openapi.json",

      // outputPaths controls WHERE generated files go.
      // No providerDir needed — all paths are absolute from project root.
      outputPaths: {
        models: "src/models",
        services: "src/services",
        types: "src/types",
        index: "src/api",
      },
    },
  },
};
