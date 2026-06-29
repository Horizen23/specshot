import type { ApiClient } from "../../core/api-client";
import type { ApiPlugin } from "../../core/types";

export function installLogger(client: ApiClient) {
  const loggerPlugin: ApiPlugin = {
    name: "logger",
    onRequest: async (config, url) => {
      console.log(`→ ${config.method?.toUpperCase() ?? "GET"} ${url}`);
      return config;
    },
    onResponse: async (response, url) => {
      console.log(`← ${response.status} ${url}`);
      return response;
    }
  };

  client.use(loggerPlugin);
}
