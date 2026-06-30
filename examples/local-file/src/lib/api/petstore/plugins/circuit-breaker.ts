import type { ApiClient } from "../../core/api-client";
import { isApiError, isClientError } from "../../core/types";
import type { ApiPlugin } from "../../core/types";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** Milliseconds to wait before attempting a half-open request */
  resetTimeoutMs?: number;
}

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit Breaker Plugin
 *
 * Prevents making network requests if the backend is consistently failing (5xx) or unreachable.
 */
export function installCircuitBreaker(
  client: ApiClient,
  options: CircuitBreakerOptions = {},
) {
  const failureThreshold = options.failureThreshold || 3;
  const resetTimeoutMs = options.resetTimeoutMs || 10000;

  let state: CircuitState = "CLOSED";
  let failureCount = 0;
  let nextAttemptMs = 0;

  function handleSuccess() {
    failureCount = 0;
    state = "CLOSED";
  }

  function handleFailure() {
    failureCount++;
    if (failureCount >= failureThreshold) {
      state = "OPEN";
      nextAttemptMs = Date.now() + resetTimeoutMs;
    }
  }

  const cbPlugin: ApiPlugin = {
    name: "circuit-breaker",

    // Wire up event listeners when the plugin is registered
    onInit: (apiClient: ApiClient) => {
      apiClient.on("success", () => {
        handleSuccess();
      });

      apiClient.on("error", (payload) => {
        const error = payload.error;
        if (isApiError(error) && error.status >= 500) {
          // Server errors (500+) count as failures
          handleFailure();
        } else if (
          isClientError(error) &&
          (error.kind === "network" || error.kind === "timeout")
        ) {
          // Network errors count as failures
          handleFailure();
        } else {
          // Client errors (4xx) or aborts shouldn't trip the breaker
          handleSuccess();
        }
      });
    },

    onRequest: async (config, url) => {
      if (state === "OPEN") {
        if (Date.now() > nextAttemptMs) {
          // Time to test the waters
          state = "HALF_OPEN";
        } else {
          // Reject immediately without hitting the network
          throw new Error(
            `Circuit Breaker is OPEN. Request to ${url} blocked to prevent backend overload.`,
          );
        }
      }
      return config;
    },
  };

  client.use(cbPlugin);
}
