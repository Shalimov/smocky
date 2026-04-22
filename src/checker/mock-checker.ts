import type { Db } from '../db';
import { resolveMockResponse } from '../responder';
import type { Router } from '../router';
import { type Engine, TemplateError } from '../template';
import type { MockRequest, ResolvedConfig } from '../types';
import type { Report, LoadedSampleOverrides, OpenApiSpec } from './types';
import { setMockResult } from './reporter';
import { generateOperationSample } from './sample-generator';
import { validate } from './validator';
import { getExpectedResponse, listOperations, matchesSkipPath, routePathToOpenApiPath } from './utils';

export async function runMockChecker(
  spec: OpenApiSpec,
  router: Router,
  engine: Engine,
  cfg: ResolvedConfig,
  overrides: LoadedSampleOverrides,
  report: Report,
  db?: Db,
): Promise<void> {
  const checkerConfig = cfg.openapi?.check;
  const documented = new Set<string>();

  for (const descriptor of listOperations(spec)) {
    documented.add(`${descriptor.method} ${descriptor.path}`);
    if (matchesSkipPath(descriptor.path, checkerConfig?.skipPaths ?? [])) {
      setMockResult(report, descriptor.method, descriptor.path, {
        status: 'skipped',
        issues: [],
        note: 'skipped by config',
      });
      continue;
    }

    const sample = generateOperationSample(descriptor, overrides);
    const concretePath = descriptor.path.replace(/\{([^}]+)\}/g, (_match, name: string) => sample.pathParams[name] ?? name);
    const match = router.match(descriptor.method, concretePath);
    if (!match) {
      setMockResult(report, descriptor.method, descriptor.path, {
        status: 'missing',
        issues: [],
        note: 'no mock found for documented endpoint',
      });
      continue;
    }

    const req = createStubRequest(descriptor.method, concretePath, sample.pathParams, sample.queryParams, sample.body);

    try {
      const resolved = await resolveMockResponse(match, req, engine, db);
      if (!resolved) {
        setMockResult(report, descriptor.method, descriptor.path, {
          status: 'missing',
          issues: [],
          note: 'mock method missing for documented endpoint',
        });
        continue;
      }

      const expected = getExpectedResponse(descriptor.operation.responses, resolved.status);
      if (!expected) {
        setMockResult(report, descriptor.method, descriptor.path, {
          status: 'mismatch',
          issues: [],
          note: `mock status ${resolved.status} is not documented in the spec`,
        });
        continue;
      }

      if (!expected.schema) {
        setMockResult(report, descriptor.method, descriptor.path, {
          status: 'ok',
          issues: [],
          note: 'matches spec',
        });
        continue;
      }

      const issues = validate(expected.schema, resolved.body);
      setMockResult(report, descriptor.method, descriptor.path, {
        status: issues.length > 0 ? 'mismatch' : 'ok',
        issues,
        note: issues.length > 0 ? 'rendered mock does not match spec' : 'matches spec',
      });
    } catch (error) {
      const note = error instanceof TemplateError ? error.message : error instanceof Error ? error.message : String(error);
      setMockResult(report, descriptor.method, descriptor.path, {
        status: 'mismatch',
        issues: [],
        note: `mock render error: ${note}`,
      });
    }
  }

  for (const route of router.routes()) {
    const openApiPath = routePathToOpenApiPath(route.pathTemplate);
    if (matchesSkipPath(openApiPath, checkerConfig?.skipPaths ?? [])) {
      continue;
    }

    for (const method of route.methods) {
      const key = `${method.toUpperCase()} ${openApiPath}`;
      if (!documented.has(key)) {
        setMockResult(report, method.toUpperCase(), openApiPath, {
          status: 'undocumented',
          issues: [],
          note: 'mock exists for undocumented endpoint',
        });
      }
    }
  }
}

function createStubRequest(
  method: string,
  path: string,
  params: Record<string, string>,
  query: Record<string, string>,
  body: unknown,
): MockRequest {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const requestInit: RequestInit = {
    method,
  };
  if (body !== undefined && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers = { 'content-type': 'application/json' };
  }

  return {
    method,
    path: url.pathname,
    params,
    query,
    headers: {},
    body,
    raw: new Request(url, requestInit),
  };
}
