/**
 * @typedef {Object} TemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Which hooks framework to scaffold: 'react-query', 'swr', or 'none'
 * @property {("bearer" | "logger" | "request-id" | "circuit-breaker")[]} [pluginNames] - List of plugins to generate
 * @property {"types-only" | "zod-schemas" | "zod-runtime"} [validation] - Validation strictness mode
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
    petstore: {
      openapiUrl: "openapi.json",
    },
  },
  alias: "@/api",
  templateData: {
    hook: "none",
    pluginNames: ["bearer", "logger", "request-id", "circuit-breaker"],
    validation: "zod-runtime",
  },
};
