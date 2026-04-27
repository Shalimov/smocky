import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { Smocky } from '../src/smocky';
import { getFreePort, withTempDir, writeJson, writeText } from './test-utils';

describe('Smocky', () => {
  test('starts and serves mocks from endpointsDir', async () => {
    await withTempDir('smocky-basic', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      await writeJson(join(endpointsDir, 'hello', 'response.json'), {
        GET: { body: { message: 'world' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
      });

      try {
        const res = await fetch(`${smocky.url}/hello`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: 'world' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('port 0 assigns a random port', async () => {
    await withTempDir('smocky-port0', async (dir) => {
      const endpointsDir = join(dir, 'endpoints');

      await writeJson(join(endpointsDir, 'ping', 'response.json'), {
        GET: { body: { value: 'pong' } },
      });

      const smocky = await Smocky.start({
        port: 0,
        endpointsDir,
      });

      try {
        expect(smocky.port).toBeGreaterThan(0);
        const res = await fetch(`${smocky.url}/ping`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ value: 'pong' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('workspace routes take priority over common routes', async () => {
    await withTempDir('smocky-ws-prio', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      // Common route
      await writeJson(join(endpointsDir, 'common', 'users', 'response.json'), {
        GET: { body: { from: 'common' } },
      });

      // Workspace route (same path, different response)
      await writeJson(join(endpointsDir, 'user-tests', 'users', 'response.json'), {
        GET: { body: { from: 'workspace' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
        workspace: 'user-tests',
      });

      try {
        const res = await fetch(`${smocky.url}/users`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ from: 'workspace' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('falls back to common routes when workspace has no match', async () => {
    await withTempDir('smocky-ws-fallback', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      // Common routes
      await writeJson(join(endpointsDir, 'common', 'users', 'response.json'), {
        GET: { body: { from: 'common' } },
      });
      await writeJson(join(endpointsDir, 'common', 'health', 'response.json'), {
        GET: { body: { status: 'ok' } },
      });

      // Workspace only has `/users`
      await writeJson(join(endpointsDir, 'user-tests', 'users', 'response.json'), {
        GET: { body: { from: 'workspace' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
        workspace: 'user-tests',
      });

      try {
        // Workspace provides /users
        const usersRes = await fetch(`${smocky.url}/users`);
        expect(usersRes.status).toBe(200);
        expect(await usersRes.json()).toEqual({ from: 'workspace' });

        // /health only exists in common — should fall back
        const healthRes = await fetch(`${smocky.url}/health`);
        expect(healthRes.status).toBe(200);
        expect(await healthRes.json()).toEqual({ status: 'ok' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('multiple workspaces', async () => {
    await withTempDir('smocky-multi-ws', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      await writeJson(join(endpointsDir, 'ws-a', 'alpha', 'response.json'), {
        GET: { body: { value: 'alpha' } },
      });
      await writeJson(join(endpointsDir, 'ws-b', 'beta', 'response.json'), {
        GET: { body: { value: 'beta' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
        workspaces: ['ws-a', 'ws-b'],
      });

      try {
        const alpha = await fetch(`${smocky.url}/alpha`);
        expect(alpha.status).toBe(200);
        expect(await alpha.json()).toEqual({ value: 'alpha' });

        const beta = await fetch(`${smocky.url}/beta`);
        expect(beta.status).toBe(200);
        expect(await beta.json()).toEqual({ value: 'beta' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('backward compatible: no workspace = old behavior', async () => {
    await withTempDir('smocky-nolegacy', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      // Old structure: files directly in endpointsDir
      await writeJson(join(endpointsDir, 'items', '_id', 'response.json'), {
        GET: { body: { id: '{{ req.params.id }}' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
      });

      try {
        const res = await fetch(`${smocky.url}/items/42`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: '42' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('returns 404 for unmatched routes without baseUrl', async () => {
    await withTempDir('smocky-404', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      const smocky = await Smocky.start({
        port,
        endpointsDir,
      });

      try {
        const res = await fetch(`${smocky.url}/missing`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
          error: 'NotFound',
          message: 'No mock matched /missing and baseUrl is not configured.',
        });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('OPTIONS preflight returns 204 with global headers', async () => {
    await withTempDir('smocky-preflight', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      const smocky = await Smocky.start({
        port,
        endpointsDir,
        globalHeaders: {
          'Access-Control-Allow-Origin': '*',
          'X-Custom': 'value',
        },
      });

      try {
        const res = await fetch(`${smocky.url}/anything`, { method: 'OPTIONS' });
        expect(res.status).toBe(204);
        expect(res.headers.get('access-control-allow-origin')).toBe('*');
        expect(res.headers.get('x-custom')).toBe('value');
      } finally {
        await smocky.stop();
      }
    });
  });

  test('helpers work within workspace mode', async () => {
    await withTempDir('smocky-helpers', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');

      await writeText(
        join(helpersDir, 'guid.ts'),
        'export default function guid() { return "fixed-guid"; }\n',
      );

      await writeJson(join(endpointsDir, 'common', 'token', 'response.json'), {
        GET: { body: { token: '{{ guid }}' } },
      });

      const smocky = await Smocky.start({
        port,
        endpointsDir,
        helpersDir,
        workspace: 'some-ws',
      });

      try {
        const res = await fetch(`${smocky.url}/token`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ token: 'fixed-guid' });
      } finally {
        await smocky.stop();
      }
    });
  });

  test('proxies unmatched routes when baseUrl is configured', async () => {
    await withTempDir('smocky-proxy', async (dir) => {
      const upstreamPort = await getFreePort();
      const appPort = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');

      const upstream = Bun.serve({
        port: upstreamPort,
        fetch(req: Request): Response {
          const url = new URL(req.url);
          return Response.json({ upstream: true, path: url.pathname });
        },
      });

      await writeJson(join(endpointsDir, 'common', 'mocked', 'response.json'), {
        GET: { body: { from: 'mock' } },
      });

      const smocky = await Smocky.start({
        port: appPort,
        endpointsDir,
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        workspace: 'some-ws',
      });

      try {
        const mocked = await fetch(`${smocky.url}/mocked`);
        expect(mocked.status).toBe(200);
        expect(await mocked.json()).toEqual({ from: 'mock' });

        const proxied = await fetch(`${smocky.url}/not-mocked`);
        expect(proxied.status).toBe(200);
        expect(await proxied.json()).toEqual({ upstream: true, path: '/not-mocked' });
      } finally {
        await smocky.stop();
        upstream.stop(true);
      }
    });
  });
});
