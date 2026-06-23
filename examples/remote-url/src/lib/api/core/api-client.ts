import {
  ApiError,
  ApiRequestConfig,
  ApiResult,
  BlobResponse,
  ClientError,
  HttpMethod,
  InterceptorManager,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  ResponseType,
  ResponseTypeMap,
  ApiClientOptions,
} from "./types";

// ==========================================
// Utilities
// ==========================================
/** Parse filename from Content-Disposition header */
function parseFilename(headers: Headers): string {
  const disposition = headers.get("content-disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  return match
    ? decodeURIComponent(match[1].trim().replace(/"/g, ""))
    : "download";
}

// ==========================================
// Response parser — dispatched by responseType
// ==========================================
async function parseResponse<R extends ResponseType, TJson>(
  response: Response,
  responseType: R,
): Promise<ResponseTypeMap<TJson>[R]> {
  type Result = ResponseTypeMap<TJson>[R];

  if (responseType === "void") return undefined as Result;

  if (responseType === "blob") {
    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (err) {
      const cause = err instanceof Error ? err : undefined;
      throw new ClientError("parse", "Failed to read response as Blob", cause);
    }
    return { blob, filename: parseFilename(response.headers) } as Result;
  }

  if (responseType === "text") {
    try {
      return (await response.text()) as Result;
    } catch (err) {
      const cause = err instanceof Error ? err : undefined;
      throw new ClientError("parse", "Failed to read response as text", cause);
    }
  }

  // Default: json
  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const cause = err instanceof Error ? err : undefined;
    throw new ClientError("parse", "Failed to parse response as JSON", cause);
  }

  return json as Result;
}

// ==========================================
// ApiClient
// ==========================================
export class ApiClient {
  public readonly interceptors = {
    request: new InterceptorManager<RequestInterceptor>(),
    response: new InterceptorManager<ResponseInterceptor>(),
  };

  public constructor(public readonly options: ApiClientOptions) {}

  private resolveUrl(url: string, params?: RequestConfig["params"]): string {
    const base = url.startsWith("http") ? url : `${this.options.baseUrl}${url}`;
    if (!params || Object.keys(params).length === 0) return base;
    const search = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return `${base}?${search}`;
  }

  // ==========================================
  // Core request — overloads for each responseType
  // ==========================================

  public request<TJson, TError = unknown>(
    url: string,
    config?: ApiRequestConfig<"json">,
  ): Promise<ApiResult<TJson, TError>>;

  public request<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"blob">,
  ): Promise<ApiResult<BlobResponse, TError>>;

  public request<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"text">,
  ): Promise<ApiResult<string, TError>>;

  public request<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"void">,
  ): Promise<ApiResult<void, TError>>;

  public request<TJson = unknown, TError = unknown>(
    url: string,
    config: ApiRequestConfig<ResponseType>,
  ): Promise<ApiResult<unknown, TError>>;

  public async request<TJson = unknown, TError = unknown>(
    url: string,
    initialConfig: ApiRequestConfig = {},
  ): Promise<ApiResult<unknown, TError>> {
    try {
      const {
        timeout,
        params,
        responseType = "json",
        ...restConfig
      } = initialConfig;
      const fullUrl = this.resolveUrl(url, params);

      // Run request interceptors
      let config: ApiRequestConfig = restConfig;
      for (const interceptor of this.interceptors.request.getAll()) {
        config = await interceptor(config, fullUrl);
      }

      // Build combined abort signal
      const signals: AbortSignal[] = [];
      if (timeout != null) signals.push(AbortSignal.timeout(timeout));
      if (config.signal instanceof AbortSignal) signals.push(config.signal);
      const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

      // Build headers — skip Content-Type for FormData (browser sets it with boundary)
      const headers = new Headers(config.headers ?? {});
      if (
        !headers.has("Content-Type") &&
        config.body &&
        typeof config.body === "string"
      ) {
        headers.set("Content-Type", "application/json");
      }

      // Fetch — classify client-side errors
      let response: Response;
      try {
        response = await fetch(fullUrl, { ...config, headers, signal });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          const isTimeout = signals.some(
            (s) =>
              s.reason instanceof DOMException &&
              s.reason.name === "TimeoutError",
          );
          if (isTimeout) {
            throw new ClientError(
              "timeout",
              `Request timed out after ${timeout}ms`,
              err,
            );
          }
          throw new ClientError("abort", "Request was cancelled", err);
        }
        if (err instanceof TypeError) {
          throw new ClientError(
            "network",
            "Network error — check your connection",
            err,
          );
        }
        throw new ClientError("network", "Unexpected fetch error", err instanceof Error ? err : new Error(String(err)));
      }

      // Run response interceptors
      for (const interceptor of this.interceptors.response.getAll()) {
        response = await interceptor(response, fullUrl, config);
      }

      // Handle HTTP errors
      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        const message =
          this.options.errorExtractor?.(errorData) || response.statusText;
        throw new ApiError<TError>(
          response.status,
          errorData as TError,
          fullUrl,
          message,
        );
      }

      if (response.status === 204)
        return { data: undefined as any, error: null, ok: true };

      const parsedData = await parseResponse<typeof responseType, TJson>(
        response,
        responseType,
      );

      let data = parsedData;
      // Allow custom unwrapping of data if provided in options
      if (this.options.dataExtractor && responseType === "json") {
        data = this.options.dataExtractor(parsedData) as any;
      }

      // Optional Runtime Schema Validation (e.g. Zod)
      if (config.responseSchema && responseType === "json") {
        const validation = config.responseSchema.safeParse(data);
        if (!validation.success) {
          throw new ClientError(
            "parse",
            "Runtime Schema Validation Failed",
            validation.error instanceof Error
              ? validation.error
              : new Error(JSON.stringify(validation.error)),
          );
        }
        data = validation.data;
      }

      return { data, error: null, ok: true };
    } catch (err) {
      if (err instanceof ApiError || err instanceof ClientError) {
        return { data: null, error: err, ok: false };
      }
      return { data: null, error: new ClientError("network", "Unexpected internal error", err instanceof Error ? err : new Error(String(err))), ok: false };
    }
  }

  // ==========================================
  // Typed HTTP Methods
  // ==========================================
  public get<TJson, TError = unknown>(
    url: string,
    config?: ApiRequestConfig<"json">,
  ): Promise<ApiResult<TJson, TError>>;
  public get<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"blob">,
  ): Promise<ApiResult<BlobResponse, TError>>;
  public get<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"text">,
  ): Promise<ApiResult<string, TError>>;
  public get<TError = unknown>(
    url: string,
    config: ApiRequestConfig<"void">,
  ): Promise<ApiResult<void, TError>>;
  public get<TJson = unknown, TError = unknown>(
    url: string,
    config: ApiRequestConfig<ResponseType>,
  ): Promise<ApiResult<unknown, TError>>;
  public get<TJson = unknown, TError = unknown>(
    url: string,
    config?: ApiRequestConfig,
  ): Promise<ApiResult<unknown, TError>> {
    return this.request<TJson, TError>(url, {
      ...config,
      method: "GET" as HttpMethod,
    } as ApiRequestConfig);
  }

  public post<
    TJson,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig<"json">,
  ): Promise<ApiResult<TJson, TError>>;
  public post<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"blob">,
  ): Promise<ApiResult<BlobResponse, TError>>;
  public post<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"text">,
  ): Promise<ApiResult<string, TError>>;
  public post<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"void">,
  ): Promise<ApiResult<void, TError>>;
  public post<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<ResponseType>,
  ): Promise<ApiResult<unknown, TError>>;
  public post<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig,
  ): Promise<ApiResult<unknown, TError>> {
    const serializedBody =
      body instanceof FormData ? body : JSON.stringify(body);
    return this.request<TJson, TError>(url, {
      ...config,
      method: "POST" as HttpMethod,
      body: serializedBody,
    } as ApiRequestConfig);
  }

  public put<
    TJson,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig<"json">,
  ): Promise<ApiResult<TJson, TError>>;
  public put<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"blob">,
  ): Promise<ApiResult<BlobResponse, TError>>;
  public put<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"text">,
  ): Promise<ApiResult<string, TError>>;
  public put<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"void">,
  ): Promise<ApiResult<void, TError>>;
  public put<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<ResponseType>,
  ): Promise<ApiResult<unknown, TError>>;
  public put<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig,
  ): Promise<ApiResult<unknown, TError>> {
    const serializedBody =
      body instanceof FormData ? body : JSON.stringify(body);
    return this.request<TJson, TError>(url, {
      ...config,
      method: "PUT" as HttpMethod,
      body: serializedBody,
    } as ApiRequestConfig);
  }

  public patch<
    TJson,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig<"json">,
  ): Promise<ApiResult<TJson, TError>>;
  public patch<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"blob">,
  ): Promise<ApiResult<BlobResponse, TError>>;
  public patch<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"text">,
  ): Promise<ApiResult<string, TError>>;
  public patch<
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<"void">,
  ): Promise<ApiResult<void, TError>>;
  public patch<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config: ApiRequestConfig<ResponseType>,
  ): Promise<ApiResult<unknown, TError>>;
  public patch<
    TJson = unknown,
    TError = unknown,
    TBody extends object | FormData = Record<string, unknown>,
  >(
    url: string,
    body: TBody,
    config?: ApiRequestConfig,
  ): Promise<ApiResult<unknown, TError>> {
    const serializedBody =
      body instanceof FormData ? body : JSON.stringify(body);
    return this.request<TJson, TError>(url, {
      ...config,
      method: "PATCH" as HttpMethod,
      body: serializedBody,
    } as ApiRequestConfig);
  }

  /** DELETE always returns void */
  public delete<TError = unknown>(
    url: string,
    config?: ApiRequestConfig,
  ): Promise<ApiResult<void, TError>> {
    return this.request<void, TError>(url, {
      ...config,
      method: "DELETE" as HttpMethod,
      responseType: "void",
    } as ApiRequestConfig<"void">) as Promise<ApiResult<void, TError>>;
  }
}
