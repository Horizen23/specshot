import { ApiClient } from "../core/api-client";

export function createApiClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl || "http://localhost:8080");
}
