import type { ApiClient } from "../../core/api-client";
import type { ApiPlugin } from "../../core/types";

export class LocaleManager {
  private locale: string | null = null;

  public setLocale(locale: string | null) {
    this.locale = locale;
  }

  public getLocale(): string | null {
    return this.locale;
  }
}

declare module "../../core/types" {
  interface PluginRegistry {
    locale: LocaleManager;
  }
}

export function installLocale(client: ApiClient) {
  const manager = new LocaleManager();

  if (typeof window !== "undefined" && typeof navigator !== "undefined") {
    manager.setLocale(navigator.language);
  }

  const plugin: ApiPlugin = {
    name: "locale",
    onInit: (c) => {
      c.use("locale", manager);
    },
    onRequest: async (config) => {
      const headers = new Headers(config.headers);

      const locale = manager.getLocale();
      if (locale && !headers.has("Accept-Language")) {
        headers.set("Accept-Language", locale);
      }

      return { ...config, headers };
    },
  };

  client.use(plugin);
}
