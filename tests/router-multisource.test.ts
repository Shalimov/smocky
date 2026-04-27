import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { createEmptyRouter, scanRoutes } from '../src/router';
import { withTempDir, writeJson, writeText } from './test-utils';

describe('multi-source router', () => {
  test('addSource registers routes', async () => {
    const router = createEmptyRouter();
    const routes = await scanRoutesFromFixture({
      'users/response.json': { GET: { body: 'users' } },
    });

    const source = router.addSource(routes, 0);

    expect(source.id).toBeString();
    expect(source.priority).toBe(0);
    expect(router.routes()).toHaveLength(1);

    const match = router.match('GET', '/users');
    expect(match).not.toBeNull();
  });

  test('removeSource removes routes', async () => {
    const router = createEmptyRouter();
    const routes = await scanRoutesFromFixture({
      'users/response.json': { GET: { body: 'users' } },
    });

    const source = router.addSource(routes, 0);
    expect(router.routes()).toHaveLength(1);

    router.removeSource(source.id);
    expect(router.routes()).toHaveLength(0);

    const match = router.match('GET', '/users');
    expect(match).toBeNull();
  });

  test('higher priority source wins on conflict', async () => {
    await withTempDir('smocky-router-prio', async (dir) => {
      const lowDir = join(dir, 'low');
      const highDir = join(dir, 'high');

      await writeJson(join(lowDir, 'users', 'response.json'), {
        GET: { body: { from: 'low' } },
      });
      await writeJson(join(highDir, 'users', 'response.json'), {
        GET: { body: { from: 'high' } },
      });

      const lowRoutes = await scanRoutes(lowDir);
      const highRoutes = await scanRoutes(highDir);

      const router = createEmptyRouter();
      router.addSource(lowRoutes, 0);
      router.addSource(highRoutes, 10);

      const match = router.match('GET', '/users');
      expect(match).not.toBeNull();
      expect(match!.route.responseFile).toContain('high');
    });
  });

  test('low priority source is used when high has no match', async () => {
    await withTempDir('smocky-router-fallback', async (dir) => {
      const lowDir = join(dir, 'low');
      const highDir = join(dir, 'high');

      await writeJson(join(lowDir, 'users', 'response.json'), {
        GET: { body: { from: 'low' } },
      });
      await writeJson(join(highDir, 'admin', 'response.json'), {
        GET: { body: { from: 'high' } },
      });

      const lowRoutes = await scanRoutes(lowDir);
      const highRoutes = await scanRoutes(highDir);

      const router = createEmptyRouter();
      router.addSource(lowRoutes, 0);
      router.addSource(highRoutes, 10);

      const adminMatch = router.match('GET', '/admin');
      expect(adminMatch).not.toBeNull();
      expect(adminMatch!.route.responseFile).toContain('high');

      const userMatch = router.match('GET', '/users');
      expect(userMatch).not.toBeNull();
      expect(userMatch!.route.responseFile).toContain('low');
    });
  });

  test('multiple sources with same priority respect specificity', async () => {
    await withTempDir('smocky-router-sameprio', async (dir) => {
      const dirA = join(dir, 'a');
      const dirB = join(dir, 'b');

      // Static route in B, dynamic route in A — static should win regardless of source order
      await writeJson(join(dirA, 'users', '_id', 'response.json'), {
        GET: { body: { from: 'a-dynamic' } },
      });
      await writeJson(join(dirB, 'users', 'me', 'response.json'), {
        GET: { body: { from: 'b-static' } },
      });

      const routesA = await scanRoutes(dirA);
      const routesB = await scanRoutes(dirB);

      const router = createEmptyRouter();
      router.addSource(routesA, 0);
      router.addSource(routesB, 0);

      const match = router.match('GET', '/users/me');
      expect(match).not.toBeNull();
      expect(match!.route.pathTemplate).toBe('/users/me');
    });
  });
});

async function scanRoutesFromFixture(files: Record<string, unknown>): Promise<ReturnType<typeof scanRoutes>> {
  const dirKey = `smocky-router-src-${Math.random().toString(36).slice(2)}`;
  return withTempDir(dirKey, async (dir) => {
    for (const [filePath, content] of Object.entries(files)) {
      await writeJson(join(dir, filePath), content);
    }
    return scanRoutes(dir);
  });
}
