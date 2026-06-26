// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClientWithPlugins } from "../client";

type PluginInstaller = (client: ApiClientWithPlugins) => void;
const registry: PluginInstaller[] = [];

export function useAllPlugins(client: ApiClientWithPlugins) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
