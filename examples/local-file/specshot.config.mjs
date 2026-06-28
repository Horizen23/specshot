/**
 * @typedef {Object} SpecshotTemplateData
 * @property {"react-query" | "swr" | "none"} [hook] - Which hooks framework to scaffold: 'react-query', 'swr', or 'none'
 * @property {("bearer" | "logger")[]} [pluginNames] - List of interceptor plugins to generate
 */
/**
 * @typedef {Object} SpecshotTemplateOverrides
 * @property {string} [dir]
 * @property {string} [msw-handlers]
 * @property {string} [plugins-index]
 * @property {string} [service]
 * @property {string} [types]
 */
/** @type {import('specshot').SpecshotConfig<TemplateData, Overrides>} */
export default {
  preset: "class",
  apis: {
    "petstore": {
      openapiUrl: "./openapi.json",
    },
  },
  templateData: {
      "hook": "none",
      "pluginNames": []
  },
};
