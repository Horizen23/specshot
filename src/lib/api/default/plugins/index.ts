import { installBearer } from "../interceptors/bearer";
import { installLogger } from "../interceptors/logger";
// Re-export for direct access
export { AuthManager } from "../interceptors/bearer-auth-manager";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClientWithPlugins } from "../client";

type PluginInstaller = (client: ApiClientWithPlugins) => void;
const registry: PluginInstaller[] = [];
registry.push(installBearer);
registry.push(installLogger);

export function useAllPlugins(client: ApiClientWithPlugins) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
