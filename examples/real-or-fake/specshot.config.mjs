/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "client/src/lib/api/core",
  providerDir: "client/src/lib/api/default",
  openapiUrl: "./meme.json",
  integration: "none",
  interceptors: ["logger"],
  plugins: [
    {
      name: "meme-faker",
      match: (ctx) => ctx.schema.description?.includes("Meme image"),
      generate: (faker) => faker.image.urlLoremFlickr({ category: 'meme' })
    }
  ]
};
