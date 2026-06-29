// ==========================================
// HTTP Method
// ==========================================
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// ==========================================
// Response Types
// ==========================================
export type ResponseType = "json" | "blob" | "text" | "void";

/** Returned when responseType is 'blob' — includes parsed filename from Content-Disposition */
export interface BlobResponse {
  blob: Blob;
  filename: string;
}

/** Map responseType string to the actual resolved TypeScript type */
export type ResponseTypeMap<TJson> = {
  json: TJson;
  blob: BlobResponse;
  text: string;
  void: void;
};

// ==========================================
// API Client Configuration
// ==========================================
export interface ApiClientOptions {
  /** The base URL for this specific API client */
  baseUrl: string;
  /** Custom logic to extract error messages from a 4xx/5xx response body */
  errorExtractor?: (data: unknown) => string | undefined;
  /** Custom logic to unwrap data from a successful response (e.g. { data: ... }) */
  dataExtractor?: (data: unknown) => unknown;
}

// ==========================================
// Request Config — extends native RequestInit
// ==========================================
export interface RequestConfig extends Omit<RequestInit, "method" | "body"> {
  method?: HttpMethod;
  /** Serializable JSON body (will be JSON.stringify'd) or FormData for file uploads */
  body?: string | FormData;
  /** Request timeout in milliseconds. Triggers AbortSignal.timeout() internally. */
  timeout?: number;
  /** URL query params — appended to the URL before fetch */
  params?: Record<string, string | number | boolean>;
}

export interface SchemaParser<T> {
  safeParse: (
    data: unknown,
  ) => { success: true; data: T } | { success: false; error: unknown };
}

/** Config specific to API Client methods with responseType support */
export type ApiRequestConfig<R extends ResponseType = ResponseType> =
  RequestConfig & {
    /** How to parse the response body. Defaults to 'json'. */
    responseType?: R;
    /** Optional schema validator (e.g. Zod) to validate the response at runtime */
    responseSchema?: SchemaParser<any>;
    /** Optional schema validator (e.g. Zod) to validate the response at runtime */
    zodSchema?: { safeParse: (data: unknown) => any };
  };

// ==========================================
// API Error
// ==========================================
export class ApiError<TData = unknown> extends Error {
  constructor(
    public status: number,
    public data: TData,
    public url: string,
    message?: string,
  ) {
    super(message || `API Error: ${status} at ${url}`);
    this.name = "ApiError";
  }
}

/** Result Pattern: Safe return type that eliminates try/catch */
export type ApiResult<TData, TErrorData = unknown> =
  | { data: TData; error: null; ok: true }
  | { data: null; error: ApiError<TErrorData> | ClientError; ok: false };

/** A Promise that can be cancelled imperatively */
export type CancelablePromise<T> = Promise<T> & {
  /** Aborts the underlying network request */
  cancel: (reason?: any) => void;
};

// ==========================================
// Client Error (network / timeout / abort)
// ==========================================
export type ClientErrorKind = "network" | "timeout" | "abort" | "parse";

export class ClientError extends Error {
  public readonly kind: ClientErrorKind;
  public readonly cause: Error | DOMException | undefined;

  constructor(
    kind: ClientErrorKind,
    message: string,
    cause?: Error | DOMException,
  ) {
    super(message);
    this.kind = kind;
    this.cause = cause;
    this.name = "ClientError";
  }
}

/**
 * Type guard for ApiError<TErrorData>
 */
export function isApiError<TErrorData = unknown>(
  e: unknown,
): e is ApiError<TErrorData> {
  return e instanceof ApiError;
}

/**
 * Type guard for ClientError (network, timeout, abort, parse)
 */
export function isClientError(e: unknown): e is ClientError {
  return e instanceof ClientError;
}

// ==========================================
// Interceptor Manager & Plugins
// ==========================================
export type RequestInterceptor = (
  config: ApiRequestConfig,
  url: string,
) => ApiRequestConfig | Promise<ApiRequestConfig>;

export type ResponseInterceptor = (
  response: Response,
  url: string,
  config: ApiRequestConfig,
) => Response | Promise<Response>;

export type ApiEventType = "request" | "success" | "error";

export interface ApiEventPayloads {
  request: { url: string; config: ApiRequestConfig };
  success: {
    url: string;
    config: ApiRequestConfig;
    data: unknown;
    status: number;
  };
  error: {
    url: string;
    config: ApiRequestConfig;
    error: ApiError<unknown> | ClientError;
  };
}

export type ApiEventListener<E extends ApiEventType> = (
  payload: ApiEventPayloads[E],
) => void;

/**
 * Type-safe interface for extending ApiClient capabilities.
 */
export interface ApiPlugin {
  /** Unique name for the plugin, used for client.plugin("name") lookup */
  name: string;
  /** Hook called when the plugin is registered */
  onInit?: (client: any) => void;
  /** Request interceptor */
  onRequest?: RequestInterceptor;
  /** Response interceptor */
  onResponse?: ResponseInterceptor;
}

export class InterceptorManager<TInterceptor> {
  private interceptors = new Map<number, TInterceptor>();
  private nextId = 0;

  /**
   * Register an interceptor. Returns an ID that can be used to eject it later.
   */
  public use(interceptor: TInterceptor): number {
    const id = this.nextId++;
    this.interceptors.set(id, interceptor);
    return id;
  }

  /**
   * Remove a previously registered interceptor by its ID.
   */
  public eject(id: number): void {
    this.interceptors.delete(id);
  }

  /**
   * Returns all active interceptors in registration order.
   */
  public getAll(): TInterceptor[] {
    return Array.from(this.interceptors.values());
  }
}
