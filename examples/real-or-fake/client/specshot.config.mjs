/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  integration: "swr",
  interceptors: ["logger"],
  apis: {
    meme: {
      providerDir: "src/lib/api/meme",
      openapiUrl: "../meme.json",
      mswOutputDir: ".specshot/msw/meme",
    },
  },
  fakerPlugins: [
    {
      name: "meme-faker",
      match: (ctx) =>
        ctx.path.endsWith("imageUrl") ||
        ctx.schema.description?.includes("Meme image"),
      generate: (faker) => faker.image.urlLoremFlickr({ category: "meme" }),
    },
  ],
};
