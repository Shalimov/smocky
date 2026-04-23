import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { startServer } from '../src/index';
import { getFreePort, withTempDir, writeJson, writeText } from './test-utils';

describe('startServer', () => {
  test('serves mocks, handles preflight, and proxies unmatched routes', async () => {
    await withTempDir('smocker-server', async (dir) => {
      const upstreamPort = await getFreePort();
      const appPort = await getFreePort();
      const upstream = Bun.serve({
        port: upstreamPort,
        fetch(req: Request): Response {
          const url = new URL(req.url);
          return Response.json({ upstream: true, path: url.pathname });
        },
      });

      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const configPath = join(dir, 'smocker.config.ts');

      await writeText(
        join(helpersDir, 'guid.ts'),
        `export default function guid() {
  return 'fixed-guid';
}\n`,
      );
      await writeJson(join(endpointsDir, 'items', '_id', 'response.json'), {
        GET: {
          body: {
            id: '{{ req.params.id }}',
            q: '{{ req.query.q }}',
            token: '{{ guid }}',
          },
          headers: {
            'x-item': '{{ req.params.id }}',
          },
        },
      });
      await writeText(
        join(endpointsDir, 'items', '_id', 'hook.ts'),
        `export default function hook(_req, res) {
  res.headers['x-hooked'] = 'true';
}\n`,
      );
      await writeText(
        configPath,
        `export default {
  port: ${appPort},
  baseUrl: 'http://127.0.0.1:${upstreamPort}',
  endpointsDir: ${JSON.stringify(endpointsDir)},
  helpersDir: ${JSON.stringify(helpersDir)},
  globalHeaders: {
    'x-global': 'yes',
    'Access-Control-Allow-Origin': '*'
  },
  record: {
    enabled: false,
    outputDir: ${JSON.stringify(join(dir, 'recorded'))}
  }
};\n`,
      );

      const server = await startServer({ config: configPath, port: appPort });

      try {
        const mocked = await fetch(`${server.url}/items/123?q=yes`);
        expect(mocked.status).toBe(200);
        expect(mocked.headers.get('x-item')).toBe('123');
        expect(mocked.headers.get('x-hooked')).toBe('true');
        expect(mocked.headers.get('x-global')).toBe('yes');
        expect(await mocked.json()).toEqual({
          id: '123',
          q: 'yes',
          token: 'fixed-guid',
        });

        const preflight = await fetch(`${server.url}/anything`, { method: 'OPTIONS' });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('*');

        const proxied = await fetch(`${server.url}/proxy-me`);
        expect(proxied.status).toBe(200);
        expect(await proxied.json()).toEqual({ upstream: true, path: '/proxy-me' });
      } finally {
        await server.stop();
        upstream.stop(true);
      }
    });
  });

  test('reload rescans helpers and routes', async () => {
    await withTempDir('smocker-reload', async (dir) => {
      const appPort = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const configPath = join(dir, 'smocker.config.ts');

      await writeText(
        join(helpersDir, 'guid.ts'),
        `export default function guid() {
  return 'v1';
}\n`,
      );
      await writeJson(join(endpointsDir, 'alpha', 'response.json'), {
        GET: { body: { value: '{{ guid }}' } },
      });
      await writeText(
        configPath,
        `export default {
  port: ${appPort},
  endpointsDir: ${JSON.stringify(endpointsDir)},
  helpersDir: ${JSON.stringify(helpersDir)},
  globalHeaders: {},
  record: {
    enabled: false,
    outputDir: ${JSON.stringify(join(dir, 'recorded'))}
  }
};\n`,
      );

      const server = await startServer({ config: configPath, port: appPort });

      try {
        const before = await fetch(`${server.url}/alpha`);
        expect(await before.json()).toEqual({ value: 'v1' });

        await writeText(
          join(helpersDir, 'guid.ts'),
          `export default function guid() {
  return 'v2';
}\n`,
        );
        await writeJson(join(endpointsDir, 'beta', 'response.json'), {
          GET: { body: { created: true, token: '{{ guid }}' } },
        });

        await server.reload();

        const alpha = await fetch(`${server.url}/alpha`);
        const beta = await fetch(`${server.url}/beta`);

        expect(await alpha.json()).toEqual({ value: 'v2' });
        expect(await beta.json()).toEqual({ created: true, token: 'v2' });
      } finally {
        await server.stop();
      }
    });
  });

  test('returns 404 for unmatched routes when baseUrl is not configured', async () => {
    await withTempDir('smocker-no-base-url', async (dir) => {
      const appPort = await getFreePort();
      const configPath = join(dir, 'smocker.config.ts');

      await writeText(
        configPath,
        `export default {
  port: ${appPort},
  endpointsDir: ${JSON.stringify(join(dir, 'endpoints'))},
  helpersDir: ${JSON.stringify(join(dir, 'helpers'))},
  globalHeaders: {},
  record: {
    enabled: false,
    outputDir: ${JSON.stringify(join(dir, 'recorded'))}
  }
};\n`,
      );

      const server = await startServer({ config: configPath, port: appPort });

      try {
        const response = await fetch(`${server.url}/missing`);

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          error: 'NotFound',
          message: 'No mock matched /missing and baseUrl is not configured.',
        });
      } finally {
        await server.stop();
      }
    });
  });
});
