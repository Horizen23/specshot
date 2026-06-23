/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "client/src/lib/api/core",
  integration: "swr",
  interceptors: ["logger"],
  apis: {
    meme: {
      providerDir: "client/src/lib/api/meme",
      openapiUrl: "./meme.json",
    }
  },
  plugins: [
    {
      name: "meme-faker",
      match: (ctx) => ctx.propName === "imageUrl",
      generate: (faker) => faker.image.urlLoremFlickr({ category: 'meme' })
    }
  ]
};
