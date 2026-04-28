import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { createResponder } from '../src/responder';
import { createEngine } from '../src/template';
import type { MatchResult } from '../src/router';
import type { MockRequest, ResolvedConfig } from '../src/types';
import { withTempDir, writeJson, writeText } from './test-utils';

const request: MockRequest = {
  method: 'GET',
  path: '/users/42',
  params: { id: '42' },
  query: {},
  headers: {},
  body: undefined,
  raw: new Request('http://localhost/users/42'),
};

const baseConfig: ResolvedConfig = {
  port: 3000,
  baseUrl: '',
  endpointsDir: '/unused/endpoints',
  helpersDir: '/unused/helpers',
  globalHeaders: { 'x-global': 'yes' },
  record: {
    enabled: false,
    outputDir: '/unused/endpoints',
    include: [],
    exclude: [],
    overwrite: false,
    fixturesDir: './fixtures',
  },
  db: {
    dir: '/unused/db',
    persist: false,
    autoId: 'uuid',
  },
  replayOnly: false,
  fixturesDir: './fixtures',
};

describe('createResponder', () => {
  test('returns 405 with allow header when method block is missing', async () => {
    await withTempDir('smocky-responder-405', async (dir) => {
      const responseFile = join(dir, 'response.json');
      await writeJson(responseFile, {
        POST: { body: { created: true } },
      });

      const responder = createResponder(baseConfig, createEngine(new Map()));
      const response = await responder.respond(buildMatch(responseFile, null, ['POST']), request);

      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
      expect(await response.json()).toEqual({
        error: 'MethodNotAllowed',
        endpoint: '/users/_id',
        method: 'GET',
        message: 'No GET response is defined for /users/_id',
      });
    });
  });

  test('returns 500 for template errors', async () => {
    await withTempDir('smocky-responder-template-error', async (dir) => {
      const responseFile = join(dir, 'response.json');
      await writeJson(responseFile, {
        GET: { body: { value: '{{ unknownHelper }}' } },
      });

      const responder = createResponder(baseConfig, createEngine(new Map()));
      const response = await responder.respond(buildMatch(responseFile), request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'TemplateError',
        message: 'unknown helper "unknownHelper"',
      });
    });
  });

  test('returns 500 with endpoint metadata when hook throws', async () => {
    await withTempDir('smocky-responder-hook-error', async (dir) => {
      const responseFile = join(dir, 'response.json');
      const hookFile = join(dir, 'hook.ts');

      await writeJson(responseFile, {
        GET: { body: { ok: true } },
      });
      await writeText(
        hookFile,
        `export default function hook() {
  throw new Error('hook exploded');
}\n`,
      );

      const responder = createResponder(baseConfig, createEngine(new Map()));
      const response = await responder.respond(buildMatch(responseFile, hookFile), request);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'HookError',
        endpoint: '/users/_id',
        method: 'GET',
        message: 'hook failed: hook exploded',
      });
    });
  });

  test('merges global headers while allowing response headers to win', async () => {
    await withTempDir('smocky-responder-headers', async (dir) => {
      const responseFile = join(dir, 'response.json');
      await writeJson(responseFile, {
        GET: {
          headers: {
            'x-global': 'override',
            'x-route': 'route',
          },
          body: { ok: true },
        },
      });

      const responder = createResponder(baseConfig, createEngine(new Map()));
      const response = await responder.respond(buildMatch(responseFile), request);

      expect(response.status).toBe(200);
      expect(response.headers.get('x-global')).toBe('override');
      expect(response.headers.get('x-route')).toBe('route');
      expect(response.headers.get('content-type')).toBe('application/json');
    });
  });
});

function buildMatch(
  responseFile: string,
  hookFile: string | null = null,
  methods: string[] = ['GET', 'POST'],
): MatchResult {
  return {
    route: {
      pattern: ['users', '_id'],
      pathTemplate: '/users/_id',
      paramNames: ['id'],
      methods: new Set(methods),
      responseFile,
      hookFile,
      specificity: 2,
    },
    params: { id: '42' },
  };
}
