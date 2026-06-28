/**
 * @typedef {Object} TemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Which hooks framework to scaffold: 'react-query', 'swr', or 'none'
 * @property {("bearer" | "logger")[]} [pluginNames] - List of interceptor plugins to generate
 */
/**
 * @typedef {Object} Overrides
 * @property {string} [dir]
 * @property {string} [browser]
 * @property {string} [core]
 * @property {string} [handlerPerTag]
 * @property {string} [index]
 * @property {string} [plugins]
 * @property {string} [provider]
 * @property {string} [servicePerTag]
 * @property {string} [typesPerTag]
 */
/** @type {import('specshot').SpecshotConfig<TemplateData, Overrides>} */
export default {
  preset: "class",
  apis: {
    prestore: {
      openapiUrl: "openapi.json",
    },
  },
  templateData: {
    hook: "none",
    pluginNames: ["bearer", "logger"],
  },
};
