/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  providerDir: "src/lib/api/default",
  integration: "react-query",
  interceptors: ["bearer"],
  openapiUrl: "./openapi.json",
  
  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   match: (ctx) => ctx.path === "root.phone",
    //   generate: (faker) => faker.phone.number()
    // }
  ]
};
