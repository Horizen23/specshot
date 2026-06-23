/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "client/src/api/core",
  providerDir: "client/src/api/default",
  integration: "swr",
  interceptors: ["bearer"],
  openapiUrl: "./meme.json",
  
  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   match: (ctx) => ctx.path === "root.phone",
    //   generate: (faker) => faker.phone.number()
    // }
  ]
};
