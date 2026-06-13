import { ApiClient } from "../core/api-client";

const API_BASE_URL = "http://localhost:8080";

export function createApiClient() {
  const client = new ApiClient({
    baseUrl: API_BASE_URL,
    dataExtractor: (data: unknown) => {
      if (
        typeof data === "object" &&
        data !== null &&
        "request_id" in data &&
        "data" in data
      ) {
        return (data as any).data;
      }
      return data;
    },
    errorExtractor: (data: unknown) => {
      if (typeof data !== "object" || data === null) return undefined;
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.errors) && obj.errors.length > 0) {
        const firstError = obj.errors[0];
        if (typeof firstError?.message === "string") return firstError.message;
      }
      if (typeof obj.message === "string") return obj.message;
      return undefined;
    },
  });

  const plugins: Record<string, unknown> = {};

  return Object.assign(client, {
    /** Register a plugin. Returns the client for chaining. */
    use(name: string, plugin: unknown) {
      (plugins as Record<string, unknown>)[name] = plugin;
      return client as ApiClientWithPlugins;
    },
    /** Get a registered plugin. */
    plugin<T = unknown>(name: string): T | undefined {
      return (plugins as Record<string, unknown>)[name] as T | undefined;
    },
  });
}

export type ApiClientWithPlugins = ReturnType<typeof createApiClient>;
