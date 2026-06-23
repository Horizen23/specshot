import { installBearer } from "./bearer";

// Re-export for direct access
export { AuthManager } from "./bearer-auth-manager";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClientWithPlugins } from "../client";

type PluginInstaller = (client: ApiClientWithPlugins) => void;
const registry: PluginInstaller[] = [];
registry.push(installBearer);

export function useAllPlugins(client: ApiClientWithPlugins) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
