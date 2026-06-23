export interface EndpointConfig {
  enabled: boolean;
  tag: string;
  operationId: string;
  method: string;
  path: string;
  statusCode: number;
  delay: number;
  mockData: string;
  mockMode?: "auto" | "faker" | "manual";
  fakerArraySize?: number;
  fakerArraySizes?: Record<string, number>;
  fakerFormats?: Record<string, string>;
  errorEnabled?: boolean;
  errorStatus?: number;
  errorBody?: string;
}

export interface Endpoint {
  key: string;
  method: string;
  path: string;
  summary?: string;
  tag: string;
  operationId: string;
  enabled: boolean;
  config: Partial<EndpointConfig> | null;
  mockExample?: string;
  mockExampleFaker?: string;
  responseSchema?: any;
  schemaTypes?: Record<string, string>;
}

export interface TagGroup {
  tag: string;
  count: number;
  endpoints: Endpoint[];
}

export interface ToastMessage {
  msg: string;
  type: string;
}

export interface TestResponse {
  status: number;
  statusText: string;
  ms: number;
  body: string;
  error?: string;
}
