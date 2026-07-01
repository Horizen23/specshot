/**
 * @typedef {Object} TemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Which hooks framework to scaffold: 'react-query', 'swr', or 'none'
 * @property {("bearer" | "logger" | "request-id" | "circuit-breaker")[]} [pluginNames] - List of plugins to generate
 * @property {"none" | "sonner" | "react-toastify" | "react-hot-toast" | "vue-toastification" | "sweetalert2" | "alert"} [toastLibrary] - Select a UI library to automatically handle global API error toasts
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
  templateData: {
    hook: "none",
    pluginNames: ["bearer", "logger", "request-id", "circuit-breaker"],
    validation: "zod-runtime",
    toastLibrary: "sonner",
  },
};
