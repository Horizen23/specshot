export interface OpenApiSchema {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: (string | number)[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
}

export interface OpenApiMediaType {
  schema?: OpenApiSchema;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiRequestBody {
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenApiSchema;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse>;
}

export interface OpenApiSpec {
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
}

export interface PropEntry {
  key: string;
  safeKey: string;
  isRequired: boolean;
  schema: OpenApiSchema;
}

export interface ServiceOp {
  method: string;
  path: string;
  operationId: string | undefined;
  summary: string | undefined;
  description: string | undefined;
  parameters: OpenApiParameter[];
  hasBody: boolean;
  hasQuery: boolean;
  hasPathParams: boolean;
  responseSchema: OpenApiSchema | undefined;
  bodySchema: OpenApiSchema | undefined;
}

export interface ServiceGroup {
  name: string;
  operations: ServiceOp[];
}
