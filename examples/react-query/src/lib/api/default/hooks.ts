"use client";

import {
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { BaseService } from "../core/base-service";
import type { ApiError, ClientError } from "../core/types";
import type { AppApiErrorData } from "./types";

export type ApiHookError<TErrorData = AppApiErrorData> =
  | ApiError<TErrorData>
  | ClientError
  | Error;

/**
 * Filter out RequestConfig or specific objects from args to generate a clean cache key.
 */
function extractCacheKeyArgs(args: any[]): any[] {
  return args.filter(
    (arg) =>
      !(
        typeof arg === "object" &&
        arg !== null &&
        ("signal" in arg || "headers" in arg || "timeout" in arg)
      ),
  );
}

// ============================================================================
// Query Key Factory
// ============================================================================

export const queryKeys = {
  all: ["api"] as const,
  service: (serviceName: string) => ["api", serviceName] as const,
  method: (serviceName: string, methodName: string) =>
    ["api", serviceName, methodName] as const,
};

// ============================================================================
// Types for Auto-Magic Hooks
// ============================================================================
import { ApiResult } from "../core/types";

type UnwrapApiResult<T> = T extends ApiResult<infer U, any> ? U : never;
type MethodData<TMethod extends (...args: any[]) => Promise<any>> =
  UnwrapApiResult<Awaited<ReturnType<TMethod>>>;

export type RQProxyMethod<TMethod extends (...args: any[]) => Promise<any>> = {
  (
    ...args: Parameters<TMethod>
  ): UseQueryResult<MethodData<TMethod>, ApiHookError>;
  queryKey: (...args: Parameters<TMethod>) => readonly unknown[];
  invalidate: () => Promise<void>;
};

export type RQProxyService<TService> = {
  [K in keyof TService as K extends "abort" | "getSignal" | "withSignal"
    ? never
    : TService[K] extends (...args: any[]) => Promise<any>
      ? K
      : never]: TService[K] extends (...args: any[]) => Promise<any>
    ? RQProxyMethod<TService[K]>
    : never;
};

export type ApiHooksProxy<TApi> = {
  [S in keyof TApi]: TApi[S] extends BaseService<any>
    ? RQProxyService<TApi[S]>
    : never;
};

// ============================================================================
// The Proxy Implementation
// ============================================================================

export function createApiHooks<TApi>(apiInstance: TApi) {
  const queryClient = useQueryClient();

  return new Proxy({} as ApiHooksProxy<TApi>, {
    get: (_, serviceName: string) => {
      return new Proxy({}, {
        get: (_, methodName: string) => {
          const hookFn = (...args: any[]) => {
            const service = (apiInstance as Record<string, Record<string, unknown>>)[serviceName];
            const method = service[methodName] as Function;

            const resourceName = service.resourceName ?? serviceName;
            const cacheKeyArgs = extractCacheKeyArgs(args);
            const queryKey = [resourceName, methodName, ...cacheKeyArgs] as const;

            const queryFn = async () => {
              const result = await method.apply(service, args);
              if (!result.ok) {
                throw result.error;
              }
              return result.data;
            };

            return useQuery({ queryKey, queryFn });
          };

          hookFn.queryKey = (...args: any[]) => {
            const service = (apiInstance as Record<string, Record<string, unknown>>)[serviceName];
            const resourceName = service.resourceName ?? serviceName;
            const cacheKeyArgs = extractCacheKeyArgs(args);
            return [resourceName, methodName, ...cacheKeyArgs] as const;
          };

          hookFn.invalidate = () => {
            const service = (apiInstance as Record<string, Record<string, unknown>>)[serviceName];
            const resourceName = service.resourceName ?? serviceName;
            return queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey;
                return Array.isArray(key) && key[0] === resourceName && key[1] === methodName;
              },
            });
          };

          return hookFn;
        }
      });
    }
  });
}
