/**
 * @typedef {Object} Overrides
 * @property {string} [dir]
 * @property {string} [index]
 * @property {string} [models]
 * @property {string} [plugins]
 * @property {string} [servicePerTag]
 * @property {string} [typesPerTag]
 */
/** @type {import('specshot').SpecshotConfig<Record<string, unknown>, Overrides>} */
export default {
  preset: "factory",
  apis: {
    petstore: {
      openapiUrl: "./openapi.json",
    },
  },
  templateData: {
    outDir: "src/factory",
  },
};
