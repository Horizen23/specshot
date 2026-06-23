/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  integration: "none",
  interceptors: ["bearer", "logger"],
  apis: {
    petstore: {
      providerDir: "src/lib/api/petstore",
      openapiUrl: "http://localhost:8080/openapi.json",
    }
  }
};
