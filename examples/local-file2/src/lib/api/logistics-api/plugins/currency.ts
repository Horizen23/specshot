import type { ApiClient } from "../../core/api-client";
import type { ApiPlugin } from "../../core/types";

export class CurrencyManager {
  private currency: string | null = null;

  public setCurrency(currency: string | null) {
    this.currency = currency;
  }

  public getCurrency(): string | null {
    return this.currency;
  }
}

declare module "../../core/types" {
  interface PluginRegistry {
    currency: CurrencyManager;
  }
}

export function installCurrency(client: ApiClient) {
  const manager = new CurrencyManager();

  const plugin: ApiPlugin = {
    name: "currency",
    onInit: (c) => {
      c.use("currency", manager);
    },
    onRequest: async (config) => {
      const headers = new Headers(config.headers);

      const currency = manager.getCurrency();
      if (currency && !headers.has("X-Currency")) {
        headers.set("X-Currency", currency);
      }

      return { ...config, headers };
    },
  };

  client.use(plugin);
}
