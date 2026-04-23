import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { buildRouter } from '../src/router';
import { withTempDir, writeJson } from './test-utils';

describe('router', () => {
  test('matches root, static, and dynamic routes with static precedence', async () => {
    await withTempDir('smocky-router', async (dir) => {
      const endpointsDir = join(dir, 'endpoints');

      await writeJson(join(endpointsDir, 'response.json'), { GET: { body: { root: true } } });
      await writeJson(join(endpointsDir, 'users', 'response.json'), { GET: { body: { list: true } } });
      await writeJson(join(endpointsDir, 'users', '_id', 'response.json'), { GET: { body: { dynamic: true } } });
      await writeJson(join(endpointsDir, 'users', 'me', 'response.json'), { GET: { body: { me: true } } });

      const router = await buildRouter(endpointsDir);

      expect(router.match('GET', '/')?.route.pathTemplate).toBe('/');
      expect(router.match('GET', '/users/')?.route.pathTemplate).toBe('/users');
      expect(router.match('GET', '/users/42')).toMatchObject({
        route: { pathTemplate: '/users/_id' },
        params: { id: '42' },
      });
      expect(router.match('GET', '/users/me')?.route.pathTemplate).toBe('/users/me');
      expect(router.match('GET', '/missing')).toBeNull();
    });
  });

  test('returns an empty router when endpointsDir does not exist', async () => {
    await withTempDir('smocky-router-missing', async (dir) => {
      const router = await buildRouter(join(dir, 'missing-endpoints'));

      expect(router.routes()).toHaveLength(0);
      expect(router.match('GET', '/anything')).toBeNull();
    });
  });
});
