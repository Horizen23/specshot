/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  integration: "none",
  interceptors: [],
  apis: {
    default: {
      providerDir: "src/lib/api/default",
      openapiUrl: "./openapi.json",
    }
  },

  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   resolveFaker(context) {
    //     // Custom logic to return a mock value
    //   }
    // }
  ],
};
