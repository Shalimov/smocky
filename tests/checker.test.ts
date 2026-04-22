import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { createDb } from '../src/db';
import { loadHelpers } from '../src/helpers-loader';
import { buildRouter } from '../src/router';
import { createEngine } from '../src/template';
import type { ResolvedConfig } from '../src/types';
import { runApiChecker } from '../src/checker/api-checker';
import { runMockChecker } from '../src/checker/mock-checker';
import { createReport } from '../src/checker/reporter';
import { generateOperationSample, loadSampleOverrides } from '../src/checker/sample-generator';
import { loadSpec } from '../src/checker/spec-loader';
import type { OpenApiParameter, OpenApiSpec } from '../src/checker/types';
import { validate } from '../src/checker/validator';
import { withTempDir, writeJson, writeText, getFreePort } from './test-utils';

describe('checker modules', () => {
  test('loadSpec dereferences file specs', async () => {
    await withTempDir('smocker-spec', async (dir) => {
      await writeJson(join(dir, 'components.json'), {
        User: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      });
      await writeText(
        join(dir, 'openapi.json'),
        JSON.stringify({
          openapi: '3.0.3',
          info: { title: 'x', version: '1' },
          paths: {
            '/users/{id}': {
              get: {
                responses: {
                  '200': {
                    description: 'ok',
                    content: {
                      'application/json': {
                        schema: { $ref: './components.json#/User' },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );

      const spec = await loadSpec(join(dir, 'openapi.json'));
      const schema = (spec.paths['/users/{id}'] as { get: { responses: { '200': { content: { 'application/json': { schema: { properties: { id: unknown } } } } } } } }).get.responses['200'].content['application/json'].schema;
      expect(schema.properties.id).toBeDefined();
    });
  });

  test('validate returns mismatches and enforces formats', () => {
    const schema = {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
      },
    };

    expect(validate(schema, { email: 'user@example.com' })).toEqual([]);
    expect(validate(schema, { email: 'not-an-email' })[0]?.keyword).toBe('format');
  });

  test('sample generator prefers overrides and synthesizes params', async () => {
    await withTempDir('smocker-samples', async (dir) => {
      const sampleFile = join(dir, 'samples.json');
      await writeJson(sampleFile, {
        createUser: { name: 'Override' },
        'POST /users': { name: 'MethodPathOverride' },
      });

      const overrides = await loadSampleOverrides(sampleFile);
      const descriptor = {
        method: 'POST',
        path: '/users/{id}',
        operation: {
          operationId: 'createUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: { name: { type: 'string' } },
                },
              },
            },
          },
        },
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'active', in: 'query', schema: { type: 'boolean' } },
        ] satisfies OpenApiParameter[],
      };

      const sample = generateOperationSample(descriptor, overrides);
      expect(sample.body).toEqual({ name: 'Override' });
      expect(sample.pathParams.id).toBeString();
      expect(sample.queryParams.active).toBeString();
    });
  });

  test('mock checker reports ok and undocumented mocks', async () => {
    await withTempDir('smocker-mock-checker', async (dir) => {
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const dbDir = join(dir, 'db');

      await writeText(join(helpersDir, 'noop.ts'), `export default function noop(){ return 'x'; }\n`);
      await writeJson(join(dbDir, 'users.json'), [{ id: 'u1', name: 'Alice', active: true }]);
      await writeJson(join(endpointsDir, 'users', 'response.json'), {
        GET: { status: 200, body: '{{ db.users.all }}' },
      });
      await writeJson(join(endpointsDir, 'ghost', 'response.json'), {
        GET: { status: 200, body: { ok: true } },
      });

      const spec = {
        openapi: '3.0.3',
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['id', 'name'],
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            active: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } satisfies OpenApiSpec;

      const router = await buildRouter(endpointsDir);
      const helpers = await loadHelpers(helpersDir);
      const engine = createEngine(helpers);
      const db = createDb();
      db.hydrate('users', [{ id: 'u1', name: 'Alice', active: true }]);

      const report = createReport();
      await runMockChecker(spec, router, engine, baseResolvedConfig(endpointsDir, helpersDir, dbDir), { byOperationId: {}, byMethodPath: {} }, report, db);

      expect(report.ops.find((op) => op.path === '/users')?.mock?.status).toBe('ok');
      expect(report.ops.find((op) => op.path === '/ghost')?.mock?.status).toBe('undocumented');
    });
  });

  test('mock checker validates hook-mutated status and body', async () => {
    await withTempDir('smocker-mock-hooks', async (dir) => {
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const dbDir = join(dir, 'db');

      await writeText(join(helpersDir, 'noop.ts'), `export default function noop(){ return 'x'; }\n`);
      await writeJson(join(dbDir, 'users.json'), [{ id: 'u1', name: 'Alice', active: true }]);
      await writeJson(join(endpointsDir, 'users', '_id', 'response.json'), {
        GET: { status: 200, body: '{{ db.users.find req.params.id }}' },
      });
      await writeText(
        join(endpointsDir, 'users', '_id', 'hook.ts'),
        [
          `import type { Hook } from 'smocker';`,
          ``,
          `const hook: Hook = (req, res) => {`,
          `  if (!res.body) {`,
          `    res.status = 404;`,
          `    res.body = { error: 'not found', id: req.params.id };`,
          `  }`,
          `};`,
          ``,
          `export default hook;`,
          ``,
        ].join('\n'),
      );

      const spec = {
        openapi: '3.0.3',
        paths: {
          '/users/{id}': {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ['missing'] } },
            ],
            get: {
              responses: {
                '404': {
                  description: 'not found',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['error', 'id'],
                        properties: {
                          error: { type: 'string' },
                          id: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } satisfies OpenApiSpec;

      const router = await buildRouter(endpointsDir);
      const helpers = await loadHelpers(helpersDir);
      const engine = createEngine(helpers);
      const db = createDb();
      db.hydrate('users', [{ id: 'u1', name: 'Alice', active: true }]);

      const report = createReport();
      await runMockChecker(spec, router, engine, baseResolvedConfig(endpointsDir, helpersDir, dbDir), { byOperationId: {}, byMethodPath: {} }, report, db);

      expect(report.ops.find((op) => op.path === '/users/{id}')?.mock?.status).toBe('ok');
    });
  });

  test('api checker validates a live API response against the spec', async () => {
    const upstreamPort = await getFreePort();
    const upstream = Bun.serve({
      port: upstreamPort,
      fetch(req: Request): Response {
        const url = new URL(req.url);
        if (req.method === 'GET' && url.pathname === '/users/u1') {
          return Response.json({ id: 'u1', name: 'Alice' });
        }
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    try {
      const spec = {
        openapi: '3.0.3',
        paths: {
          '/users/{id}': {
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ['u1'] } },
            ],
            get: {
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        required: ['id', 'name'],
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      } satisfies OpenApiSpec;

      const report = createReport();
      await runApiChecker(
        spec,
        {
          ...baseResolvedConfig('/unused/endpoints', '/unused/helpers', '/unused/db'),
          baseUrl: `http://127.0.0.1:${upstreamPort}`,
          openapi: {
            spec: '/unused/spec.json',
            check: {
              timeout: 1000,
              skipPaths: [],
              failOnMismatch: false,
            },
          },
        },
        { byOperationId: {}, byMethodPath: {} },
        report,
      );

      expect(report.ops[0]?.api?.status).toBe('ok');
    } finally {
      upstream.stop(true);
    }
  });
});

afterEach(() => {
  // no-op placeholder for symmetry if future checker tests stub globals
});

function baseResolvedConfig(endpointsDir: string, helpersDir: string, dbDir: string): ResolvedConfig {
  return {
    port: 3000,
    baseUrl: '',
    endpointsDir,
    helpersDir,
    globalHeaders: {},
    record: {
      enabled: false,
      outputDir: endpointsDir,
      include: [],
      exclude: [],
      overwrite: false,
    },
    db: {
      dir: dbDir,
      persist: false,
      autoId: 'uuid',
    },
    openapi: {
      spec: '/unused/spec.json',
      check: {
        timeout: 1000,
        skipPaths: [],
        failOnMismatch: false,
      },
    },
  };
}
