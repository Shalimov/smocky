import type { RecordRule } from '../types';
import type {
  OpenApiOperation,
  OpenApiParameter,
  OpenApiSpec,
  OperationDescriptor,
} from './types';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export function listOperations(spec: OpenApiSpec): OperationDescriptor[] {
  const operations: OperationDescriptor[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathParameters = asParameters((pathItem as { parameters?: unknown }).parameters);

    for (const [method, value] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method.toLowerCase())) {
        continue;
      }

      const operation = value as OpenApiOperation;
      operations.push({
        method: method.toUpperCase(),
        path,
        operation,
        parameters: [...pathParameters, ...asParameters(operation.parameters)],
      });
    }
  }

  return operations;
}

export function matchesSkipPath(path: string, rules: RecordRule[]): boolean {
  for (const rule of rules) {
    if (typeof rule === 'string' && path.startsWith(rule)) {
      return true;
    }
    if (rule instanceof RegExp && rule.test(path)) {
      return true;
    }
  }

  return false;
}

export function getJsonSchema(content?: Record<string, { schema?: Record<string, unknown> }>): Record<string, unknown> | undefined {
  return content?.['application/json']?.schema;
}

export function getExpectedResponse(
  responses: OpenApiOperation['responses'] | undefined,
  status: number,
): { schema?: Record<string, unknown>; key?: string } | undefined {
  if (!responses) {
    return undefined;
  }

  const exactKey = String(status);
  if (responses[exactKey]) {
    return { key: exactKey, schema: getJsonSchema(responses[exactKey]?.content) };
  }

  const statusFamily = `${String(status)[0]}XX`;
  if (responses[statusFamily]) {
    return { key: statusFamily, schema: getJsonSchema(responses[statusFamily]?.content) };
  }

  if (responses.default) {
    return { key: 'default', schema: getJsonSchema(responses.default.content) };
  }

  return undefined;
}

export function buildConcretePath(path: string, pathParams: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(pathParams[name] ?? name));
}

export function buildCheckUrl(
  baseUrl: string,
  path: string,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
): URL {
  const url = new URL(buildConcretePath(path, pathParams), baseUrl);
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function routePathToOpenApiPath(routePath: string): string {
  return routePath
    .split('/')
    .map((segment) => (segment.startsWith('_') ? `{${segment.slice(1)}}` : segment))
    .join('/');
}

function asParameters(value: unknown): OpenApiParameter[] {
  return Array.isArray(value) ? (value as OpenApiParameter[]) : [];
}
