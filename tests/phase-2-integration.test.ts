import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { startServer } from '../src/index';
import { getFreePort, withTempDir, writeJson, writeText } from './test-utils';

describe('Phase 2 integration', () => {
  test('templates can read db state and hooks can mutate it through ctx.db', async () => {
    await withTempDir('smocker-phase2', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const dbDir = join(dir, 'db');
      const configPath = join(dir, 'mock.config.ts');

      await writeText(
        join(helpersDir, 'guid.ts'),
        `export default function guid() {
  return 'unused';
}\n`,
      );
      await writeJson(join(dbDir, 'users.json'), [
        { id: 'u1', name: 'Alice', active: true },
        { id: 'u2', name: 'Bob', active: false },
      ]);
      await writeJson(join(endpointsDir, 'users', 'response.json'), {
        GET: {
          body: {
            users: '{{ db.users.all }}',
            activeUsers: '{{ db.users.where active=true }}',
          },
        },
        POST: {
          status: 201,
          body: '{{ req.body }}',
        },
      });
      await writeText(
        join(endpointsDir, 'users', 'hook.ts'),
        `export default function hook(req, res, ctx) {
  const users = ctx.db.collection('users');
  if (req.method === 'POST') {
    res.body = users.insert(req.body);
    res.status = 201;
    return;
  }
  if (req.method === 'GET') {
    res.headers['x-count'] = String(users.all().length);
  }
}\n`,
      );
      await writeJson(join(endpointsDir, 'users', '_id', 'response.json'), {
        GET: {
          body: '{{ db.users.find req.params.id }}',
        },
        DELETE: {
          status: 204,
          body: {},
        },
      });
      await writeText(
        join(endpointsDir, 'users', '_id', 'hook.ts'),
        `export default function hook(req, res, ctx) {
  const users = ctx.db.collection('users');
  if (req.method === 'DELETE') {
    const removed = users.remove(req.params.id);
    if (!removed) {
      res.status = 404;
      res.body = { error: 'not found' };
    }
  }
}\n`,
      );
      await writeText(
        configPath,
        `export default {
  port: ${port},
  endpointsDir: ${JSON.stringify(endpointsDir)},
  helpersDir: ${JSON.stringify(helpersDir)},
  globalHeaders: {},
  record: {
    enabled: false,
    outputDir: ${JSON.stringify(join(dir, 'recorded'))}
  },
  db: {
    dir: ${JSON.stringify(dbDir)},
    persist: false,
    autoId: 'uuid'
  }
};\n`,
      );

      const server = await startServer({ config: configPath, port });

      try {
        const initial = await fetch(`${server.url}/users`);
        expect(initial.status).toBe(200);
        expect(initial.headers.get('x-count')).toBe('2');
        expect(await initial.json()).toEqual({
          users: [
            { id: 'u1', name: 'Alice', active: true },
            { id: 'u2', name: 'Bob', active: false },
          ],
          activeUsers: [{ id: 'u1', name: 'Alice', active: true }],
        });

        const created = await fetch(`${server.url}/users`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Cara', active: true }),
        });
        const createdBody = (await created.json()) as { id: string; name: string; active: boolean };
        expect(created.status).toBe(201);
        expect(createdBody.name).toBe('Cara');
        expect(createdBody.active).toBe(true);
        expect(createdBody.id).toBeString();

        const afterCreate = await fetch(`${server.url}/users`);
        const afterCreateBody = (await afterCreate.json()) as {
          users: Array<{ id: string; name: string; active: boolean }>;
          activeUsers: Array<{ id: string; name: string; active: boolean }>;
        };
        expect(afterCreateBody.users).toHaveLength(3);
        expect(afterCreateBody.activeUsers).toHaveLength(2);

        const found = await fetch(`${server.url}/users/${createdBody.id}`);
        expect(found.status).toBe(200);
        expect(await found.json()).toEqual(createdBody);

        const removed = await fetch(`${server.url}/users/${createdBody.id}`, { method: 'DELETE' });
        expect(removed.status).toBe(204);

        const finalUsers = await fetch(`${server.url}/users`);
        const finalBody = (await finalUsers.json()) as { users: Array<{ id: string }> };
        expect(finalBody.users).toHaveLength(2);
      } finally {
        await server.stop();
      }
    });
  });

  test('db persistence writes mutated collections back to disk on stop', async () => {
    await withTempDir('smocker-phase2-persist', async (dir) => {
      const port = await getFreePort();
      const endpointsDir = join(dir, 'endpoints');
      const helpersDir = join(dir, 'helpers');
      const dbDir = join(dir, 'db');
      const configPath = join(dir, 'mock.config.ts');

      await writeText(join(helpersDir, 'guid.ts'), `export default function guid() { return 'unused'; }\n`);
      await writeJson(join(dbDir, 'users.json'), [{ id: 'u1', name: 'Alice', active: true }]);
      await writeJson(join(endpointsDir, 'users', 'response.json'), {
        POST: { status: 201, body: '{{ req.body }}' },
      });
      await writeText(
        join(endpointsDir, 'users', 'hook.ts'),
        `export default function hook(req, res, ctx) {
  if (req.method === 'POST') {
    res.body = ctx.db.collection('users').insert(req.body);
    res.status = 201;
  }
}\n`,
      );
      await writeText(
        configPath,
        `export default {
  port: ${port},
  endpointsDir: ${JSON.stringify(endpointsDir)},
  helpersDir: ${JSON.stringify(helpersDir)},
  globalHeaders: {},
  record: {
    enabled: false,
    outputDir: ${JSON.stringify(join(dir, 'recorded'))}
  },
  db: {
    dir: ${JSON.stringify(dbDir)},
    persist: true,
    autoId: 'uuid'
  }
};\n`,
      );

      const server = await startServer({ config: configPath, port });

      try {
        const created = await fetch(`${server.url}/users`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Persisted', active: false }),
        });
        expect(created.status).toBe(201);
      } finally {
        await server.stop();
      }

      const saved = JSON.parse(await readFile(join(dbDir, 'users.json'), 'utf8')) as Array<{ name: string }>;
      expect(saved).toHaveLength(2);
      expect(saved.map((item) => item.name)).toContain('Persisted');
    });
  });
});
