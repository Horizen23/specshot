import { RequestConfig } from "../core/types";
export * from "../core/types";

export interface BackendResponse<T> {
  request_id: string;
  data: T;
}

export interface AppApiErrorData {
  $schema?: string;
  request_id?: string;
  status: number;
  title: string;
  detail: string;
  errors?: Array<{ message: string }>;
}

export interface PageResponse<T> {
  items: T[];
  total_items: number;
  total_pages: number;
  page: number;
  size: number;
}

import { AuthConfig } from "./plugins/bearer";
export interface AppRequestConfig extends RequestConfig, AuthConfig {}
