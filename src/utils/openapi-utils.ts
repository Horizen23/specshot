import type { OpenApiSpec, OpenApiOperation } from "../types/types";
import { endpointKey } from "../types/mock-config";
import { HTTP_OK, JSON_CONTENT_TYPE } from "../types/constants";

export interface FlatEndpoint {
  tag: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  key: string;
  responseSchema: OpenApiSpec["components"] extends { schemas: infer S }
    ? any
    : any;
}

export function flattenEndpoints(spec: OpenApiSpec): FlatEndpoint[] {
  const endpoints: FlatEndpoint[] = [];
  const entries = Object.entries(spec.paths ?? {}) as [
    string,
    Record<string, OpenApiOperation>,
  ][];

  for (const [pathUrl, methods] of entries) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.tags || operation.tags.length === 0) continue;
      const tag = operation.tags[0];
      const opId =
        operation.operationId ||
        `${method}${pathUrl.replace(/[^a-zA-Z0-9_]/g, "")}`;
      const key = endpointKey(tag, opId);

      endpoints.push({
        tag,
        operationId: opId,
        method: method.toUpperCase(),
        path: pathUrl,
        summary: operation.summary || "",
        key,
        responseSchema:
          operation.responses?.[HTTP_OK]?.content?.[JSON_CONTENT_TYPE]?.schema,
      });
    }
  }
  return endpoints;
}

export function groupByTag(
  endpoints: FlatEndpoint[],
): Map<string, FlatEndpoint[]> {
  const map = new Map<string, FlatEndpoint[]>();
  for (const ep of endpoints) {
    const list = map.get(ep.tag) || [];
    list.push(ep);
    map.set(ep.tag, list);
  }
  return map;
}
