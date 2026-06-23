/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  providerDir: "src/lib/api/default",
  openapiUrl: "http://localhost:8080/openapi.json",
  integration: "react-query",
  interceptors: ["bearer", "logger"],
};
