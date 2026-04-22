import type { ResolvedConfig } from '../types';
import type { Report, LoadedSampleOverrides, OpenApiSpec } from './types';
import { setApiResult } from './reporter';
import { generateOperationSample } from './sample-generator';
import { validate } from './validator';
import { buildCheckUrl, getExpectedResponse, listOperations, matchesSkipPath } from './utils';

export async function runApiChecker(
  spec: OpenApiSpec,
  cfg: ResolvedConfig,
  overrides: LoadedSampleOverrides,
  report: Report,
): Promise<void> {
  const checkerConfig = cfg.openapi?.check;
  if (!cfg.baseUrl) {
    throw new Error('[smocker] baseUrl is required for `smocker check api`');
  }

  for (const descriptor of listOperations(spec)) {
    if (matchesSkipPath(descriptor.path, checkerConfig?.skipPaths ?? [])) {
      setApiResult(report, descriptor.method, descriptor.path, {
        status: 'skipped',
        issues: [],
        note: 'skipped by config',
      });
      continue;
    }

    const sample = generateOperationSample(descriptor, overrides);
    if (sample.skippedReason) {
      setApiResult(report, descriptor.method, descriptor.path, {
        status: 'skipped',
        issues: [],
        note: sample.skippedReason,
      });
      continue;
    }

    const url = buildCheckUrl(cfg.baseUrl, descriptor.path, sample.pathParams, sample.queryParams);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), checkerConfig?.timeout ?? 5000);
    const startedAt = performance.now();

    try {
      const headers = new Headers(checkerConfig?.auth?.headers ?? {});
      let body: string | undefined;
      if (sample.body !== undefined && !['GET', 'HEAD'].includes(descriptor.method)) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(sample.body);
      }

      const response = await fetch(url, {
        method: descriptor.method,
        headers,
        body,
        signal: controller.signal,
      });
      const expected = getExpectedResponse(descriptor.operation.responses, response.status);
      if (!expected) {
        setApiResult(report, descriptor.method, descriptor.path, {
          status: 'mismatch',
          issues: [],
          note: `unexpected status ${response.status}`,
          statusCode: response.status,
          elapsedMs: performance.now() - startedAt,
        });
        continue;
      }

      if (!expected.schema) {
        setApiResult(report, descriptor.method, descriptor.path, {
          status: 'ok',
          issues: [],
          note: `status ${response.status} matches spec`,
          statusCode: response.status,
          elapsedMs: performance.now() - startedAt,
        });
        continue;
      }

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          setApiResult(report, descriptor.method, descriptor.path, {
            status: 'mismatch',
            issues: [
              {
                path: '/',
                message: 'response body is not valid JSON',
                keyword: 'parse',
              },
            ],
            note: `status ${response.status}`,
            statusCode: response.status,
            elapsedMs: performance.now() - startedAt,
          });
          continue;
        }
      }

      const issues = validate(expected.schema, payload);
      setApiResult(report, descriptor.method, descriptor.path, {
        status: issues.length > 0 ? 'mismatch' : 'ok',
        issues,
        note: `status ${response.status}${issues.length > 0 ? '' : ' matches spec'}`,
        statusCode: response.status,
        elapsedMs: performance.now() - startedAt,
      });
    } catch (error) {
      setApiResult(report, descriptor.method, descriptor.path, {
        status: error instanceof Error && error.name === 'AbortError' ? 'error' : 'error',
        issues: [],
        note: error instanceof Error && error.name === 'AbortError' ? 'transport error: timeout' : `transport error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
