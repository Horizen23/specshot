type RequestConfig = RequestInit & { params?: Record<string, any> };

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  private async request<T, E>(
    method: string,
    path: string,
    body?: any,
    config?: RequestConfig
  ): Promise<{ data: T | null; error: { message: string; status?: number } | null; ok: boolean }> {
    try {
      const url = `${this.baseUrl}${path}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...config?.headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: config?.signal,
      });

      if (!res.ok) {
        return {
          data: null,
          error: { message: `HTTP ${res.status}`, status: res.status },
          ok: false,
        };
      }

      const data = await res.json();
      return { data, error: null, ok: true };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err.message || "Network error" },
        ok: false,
      };
    }
  }

  async get<T, E>(path: string, config?: RequestConfig) {
    return this.request<T, E>("GET", path, undefined, config);
  }

  async post<T, E>(path: string, body?: any, config?: RequestConfig) {
    return this.request<T, E>("POST", path, body, config);
  }

  async put<T, E>(path: string, body?: any, config?: RequestConfig) {
    return this.request<T, E>("PUT", path, body, config);
  }

  async delete<T, E>(path: string, config?: RequestConfig) {
    return this.request<T, E>("DELETE", path, undefined, config);
  }
}
