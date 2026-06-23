import type { ApiClientWithPlugins } from "../client";
import type { ApiRequestConfig } from "../../core/types";
import { AuthManager } from "./bearer-auth-manager";

interface AuthConfig extends ApiRequestConfig {
  skip?: { auth?: boolean; refreshToken?: boolean };
}

const retried = new WeakMap<object, boolean>();

export function installBearer(client: ApiClientWithPlugins) {
  const authManager = new AuthManager();

  client.interceptors.request.use(async (config, url) => {
    const cfg = config as AuthConfig;
    const token = authManager.getToken();
    const headers = new Headers(cfg.headers as HeadersInit);
    if (token && !cfg.skip?.auth && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return { ...cfg, headers } as ApiRequestConfig;
  });

  client.interceptors.response.use(async (response, url, config) => {
    const cfg = config as AuthConfig;
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
  });

  client.use("auth", authManager);
}
