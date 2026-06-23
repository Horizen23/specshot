/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  integration: "swr",
  interceptors: ["bearer", "logger"],
  apis: {
    petstore: {
      providerDir: "src/lib/api/petstore",
      openapiUrl: "./openapi.json",
    },
  },
};
