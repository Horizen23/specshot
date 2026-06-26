export default {
  integration: "none",
  templates: "./templates",
  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
      providerDir: "src",

      // Custom file naming using Handlebars helpers
      fileNaming: {
        models: "schemas.ts",
        service: "{{pascalCase tag}}Service.ts",
        types: "{{pascalCase tag}}Types.ts",
      },
    },
  },
};
