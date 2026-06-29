import { installBearer } from "./bearer";
import { installLogger } from "./logger";
// Re-export for direct access
export { AuthManager } from "./bearer-auth-manager";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClient } from "../../core/api-client";

type PluginInstaller = (client: ApiClient) => void;
const registry: PluginInstaller[] = [];
registry.push(installBearer);
registry.push(installLogger);

export function useAllPlugins(client: ApiClient) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
