/**
 * AuthManager — Isomorphic token manager for the API client.
 * Works seamlessly in both Client and Server environments because
 * it doesn't hardcode `next-auth` imports. The app layer will inject the logic.
 */
import type { AppApiErrorData } from "../types";

export class AuthManager {
  private token: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  // Injected handler that calls NextAuth `getSession()` or `getServerSession()`
  private refreshHandler: (() => Promise<string | null>) | null = null;

  /** Get the current access token synchronously */
  public getToken(): string | null {
    return this.token;
  }

  /** Set the access token (called by SessionProvider or Server Component) */
  public setToken(token: string | null): void {
    this.token = token;
  }

  /** Register the async function that will be called when a 401 occurs */
  public setRefreshHandler(handler: () => Promise<string | null>): void {
    this.refreshHandler = handler;
  }

  /**
   * Called by the interceptor when a 401 response is received.
   * Uses a lock (refreshPromise) to prevent multiple parallel refresh calls
   * if multiple API requests fail at the exact same time.
   */
  public async refreshToken(): Promise<string | null> {
    if (!this.refreshHandler) return null;

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshHandler().finally(() => {
      this.refreshPromise = null;
    });

    const newToken = await this.refreshPromise;
    this.setToken(newToken);
    return newToken;
  }
}
