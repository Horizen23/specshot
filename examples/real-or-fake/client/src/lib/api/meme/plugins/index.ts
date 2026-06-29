import { installLogger } from "./logger";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClient } from "../../core/api-client";

type PluginInstaller = (client: ApiClient) => void;
const registry: PluginInstaller[] = [];
registry.push(installLogger);

export function useAllPlugins(client: ApiClient) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
