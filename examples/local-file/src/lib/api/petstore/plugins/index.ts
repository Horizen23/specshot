import { installBearer } from "./bearer";
import { installCircuitBreaker } from "./circuit-breaker";
import { installLogger } from "./logger";
import { installRequestId } from "./request-id";
// Re-export for direct access
export { AuthManager } from "./bearer-auth-manager";

// ==========================================
// Plugin Registry
// ==========================================

import type { ApiClient } from "@/api/core/api-client";

type PluginInstaller = (client: ApiClient) => void;
const registry: PluginInstaller[] = [];
registry.push(installBearer);
registry.push(installCircuitBreaker);
registry.push(installLogger);
registry.push(installRequestId);

export function useAllPlugins(client: ApiClient) {
  for (const install of registry) {
    install(client);
  }
  return client;
}
