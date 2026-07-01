import { installLogger } from "./logger";
import { installToast } from "./toast";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClient } from "../../core/api-client";

type PluginInstaller = (client: ApiClient) => void;
const registry: PluginInstaller[] = [];
registry.push(installLogger);
registry.push(installToast);

export function useAllPlugins(client: ApiClient) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
