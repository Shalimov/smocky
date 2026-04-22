import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createDb } from '../src/db';
import { loadSeeds } from '../src/db-loader';
import { createDbPersister } from '../src/db-persist';
import { withTempDir, writeJson } from './test-utils';

describe('db core', () => {
  test('supports collection CRUD operations and lazy collection creation', () => {
    const db = createDb();
    expect(db.collections()).toEqual([]);

    const users = db.collection<{ id: string; name: string; active?: boolean }>('users');

    expect(users.all()).toEqual([]);

    const created = users.insert({ name: 'Alice', active: true });
    expect(db.collections()).toEqual(['users']);
    expect(created.id).toBeString();
    expect(users.find(created.id)).toEqual(created);
    expect(users.where({ active: true })).toEqual([created]);
    expect(users.query((item) => item.name.startsWith('A'))).toEqual([created]);

    const updated = users.update(created.id, { name: 'Alicia', id: 'override-attempt' } as never);
    expect(updated).toEqual({ ...created, name: 'Alicia' });
    expect(users.find(created.id)?.id).toBe(created.id);

    expect(users.remove(created.id)).toBe(true);
    expect(users.remove(created.id)).toBe(false);
    expect(users.find(created.id)).toBeUndefined();
  });

  test('supports hydrate and reset', () => {
    const db = createDb();
    db.hydrate('users', [{ id: 'u1', name: 'Alice' }]);

    expect(db.collection('users').all()).toEqual([{ id: 'u1', name: 'Alice' }]);

    db.reset();

    expect(db.collections()).toEqual([]);
    expect(db.collection('users').all()).toEqual([]);
  });
});

describe('db loader', () => {
  test('loads seed arrays into collections and ignores missing directories', async () => {
    await withTempDir('smocker-db-loader', async (dir) => {
      const db = createDb();
      const seedDir = join(dir, 'db');

      await writeJson(join(seedDir, 'users.json'), [
        { id: 'u1', name: 'Alice', active: true },
        { id: 'u2', name: 'Bob', active: false },
      ]);
      await writeJson(join(seedDir, 'posts.json'), [{ id: 'p1', title: 'Hello' }]);

      await loadSeeds(db, seedDir);

      expect(db.collections()).toEqual(['posts', 'users']);
      expect(db.collection('users').find('u1')).toEqual({ id: 'u1', name: 'Alice', active: true });

      const emptyDb = createDb();
      await loadSeeds(emptyDb, join(dir, 'missing'));
      expect(emptyDb.collections()).toEqual([]);
    });
  });

  test('throws for invalid or non-array seed files', async () => {
    await withTempDir('smocker-db-loader-error', async (dir) => {
      const db = createDb();
      const seedDir = join(dir, 'db');

      await writeJson(join(seedDir, 'users.json'), { not: 'an array' });
      await expect(loadSeeds(db, seedDir)).rejects.toThrow('must be a JSON array');
    });
  });
});

describe('db persistence', () => {
  test('debounces writes and flush persists pending data', async () => {
    await withTempDir('smocker-db-persist', async (dir) => {
      const persister = createDbPersister({ dir, debounceMs: 20 });

      persister.schedule('users', [{ id: 'u1', name: 'Alice' }]);
      persister.schedule('users', [{ id: 'u1', name: 'Alicia' }]);
      await persister.flush();

      const saved = JSON.parse(await readFile(join(dir, 'users.json'), 'utf8')) as Array<{ id: string; name: string }>;
      expect(saved).toEqual([{ id: 'u1', name: 'Alicia' }]);
    });
  });

  test('db flush writes after mutations when onMutation is wired', async () => {
    await withTempDir('smocker-db-flush', async (dir) => {
      const persister = createDbPersister({ dir, debounceMs: 1000 });
      const db = createDb({
        onMutation(name, items) {
          persister.schedule(name, items);
        },
        onFlush() {
          return persister.flush();
        },
      });

      const users = db.collection<{ id: string; name: string }>('users');
      users.insert({ id: 'u1', name: 'Alice' });
      users.insert({ id: 'u2', name: 'Bob' });

      await db.flush();

      const saved = JSON.parse(await readFile(join(dir, 'users.json'), 'utf8')) as Array<{ id: string; name: string }>;
      expect(saved).toEqual([
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ]);
    });
  });
});
