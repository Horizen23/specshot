import { ApiClient } from "./api-client";
import { RequestConfig } from "./types";

// ==========================================
// Base Service with abort + timeout support
// ==========================================
export abstract class BaseService<TResource extends string = string> {
  private abortController: AbortController | null = null;

  constructor(
    protected readonly client: ApiClient,
    public readonly resourceName: TResource,
  ) {}

  /**
   * Cancel all in-flight requests made by this service instance.
   */
  public abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Returns the active AbortSignal, creating a new controller if needed.
   */
  protected getSignal(): AbortSignal {
    if (!this.abortController || this.abortController.signal.aborted) {
      this.abortController = new AbortController();
    }
    return this.abortController.signal;
  }

  /**
   * Helper to attach the AbortSignal from the class-level controller.
   * Uses generic <T extends RequestConfig> to preserve any extended config properties (e.g. AppRequestConfig).
   */
  protected withSignal<T extends RequestConfig>(config?: T): T {
    const signal = this.getSignal();
    return config
      ? { ...config, signal: config.signal ?? signal }
      : ({ signal } as unknown as T);
  }
}

export type { RequestConfig };
