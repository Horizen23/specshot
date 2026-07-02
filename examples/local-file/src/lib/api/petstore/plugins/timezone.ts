import type { ApiClient } from "../../core/api-client";
import type { ApiPlugin } from "../../core/types";

export function installTimezone(client: ApiClient) {
  const timezonePlugin: ApiPlugin = {
    name: "timezone",
    onRequest: async (config) => {
      const headers = new Headers(config.headers);

      if (!headers.has("X-Timezone")) {
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz) {
            headers.set("X-Timezone", tz);
          }
        } catch (e) {
          // Fallback if Intl is not supported
        }
      }

      return { ...config, headers };
    },
  };

  client.use(timezonePlugin);
}
