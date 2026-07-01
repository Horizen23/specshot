import type { ApiClient } from "../../core/api-client";
import type { ApiRequestConfig } from "../../core/types";

export interface ToastConfig {
  /** If true, prevents a global toast notification from appearing if this request fails. */
  silent?: boolean;
}

/**
 * Global Error Handler Plugin
 * Listens to all API errors and displays a toast notification.
 */
export function installToast(client: ApiClient) {
  client.on("error", ({ error, config }) => {
    // You can skip showing a toast for specific requests by adding `silent: true` to the request config
    const cfg = config as ApiRequestConfig & ToastConfig;
    if (cfg.silent) return;

    const message = error.message || "Something went wrong with the request.";
  });
}
