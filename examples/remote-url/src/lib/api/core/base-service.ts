import { ApiClient } from "./api-client";

export class BaseService<T extends string> {
  protected client: ApiClient;
  protected tag: T;

  constructor(client: ApiClient, tag: T) {
    this.client = client;
    this.tag = tag;
  }

  protected withSignal(config?: any) {
    return config;
  }
}
