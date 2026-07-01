import type { ApiClient } from "../../core/api-client";
import type { ApiRequestConfig, ApiPlugin } from "../../core/types";
import { AuthManager } from "./bearer-auth-manager";

export interface AuthConfig {
  skip?: { auth?: boolean; refreshToken?: boolean };
}

declare module "../../core/types" {
  interface PluginRegistry {
    auth: AuthManager;
  }
}

const retried = new WeakMap<object, boolean>();

export function installBearer(client: ApiClient) {
  const authManager = new AuthManager();

  const bearerPlugin: ApiPlugin = {
    name: "bearerAuth",
    onInit: (c) => {
      // Expose the auth manager directly on the client for manual access (client.plugin('auth'))
      c.use("auth", authManager);
    },
    onRequest: async (config, url) => {
      const cfg = config as ApiRequestConfig & AuthConfig;
      const token = authManager.getToken();
      const headers = new Headers(cfg.headers as HeadersInit);
      if (token && !cfg.skip?.auth && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return { ...cfg, headers } as ApiRequestConfig;
    },
    onResponse: async (response, url, config) => {
      const cfg = config as ApiRequestConfig & AuthConfig;
      if (
        response.status === 401 &&
        !retried.has(cfg) &&
        !cfg.skip?.refreshToken
      ) {
        const newToken = await authManager.refreshToken();
        if (newToken) {
          const newHeaders = new Headers(cfg.headers as HeadersInit);
          newHeaders.set("Authorization", `Bearer ${newToken}`);
          const retryConfig = { ...cfg, headers: newHeaders };
          retried.set(retryConfig, true);
          return fetch(url, retryConfig as RequestInit);
        }
      }
      return response;
    },
  };

  client.use(bearerPlugin);
}
