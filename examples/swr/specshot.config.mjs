/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  providerDir: "src/lib/api/default",
  openapiUrl: "./openapi.json",
  integration: "swr",
  interceptors: ["bearer", "logger"],
};
