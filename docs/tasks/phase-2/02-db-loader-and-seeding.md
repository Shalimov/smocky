# Task T-2.02: DB Loader & Seeding

## Status
- [ ] Not started

## Goal
Discover seed files in `db/`, parse each as a JSON array, and hydrate the
DB collections built in T-2.01.

## Context
Seed data lives in `db/<collection>.json`. Loader runs once at startup and
populates the DB before the server starts serving.

## Inputs / Prerequisites
- T-2.01 complete.
- Read: [`architecture/11-database.md`](../../architecture/11-database.md).
- Decisions: D-022.

## Deliverables
- `src/db-loader.ts`

## Implementation Notes

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';
import type { Db } from './db';

export async function loadSeeds(db: Db, dir: string): Promise<void> {
  const absDir = resolve(dir);
  let files: string[];
  try { files = await readdir(absDir); } catch { return; }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const name = parse(file).name;
    const content = await readFile(join(absDir, file), 'utf8');
    let items: unknown;
    try { items = JSON.parse(content); }
    catch (e) { throw new Error(`db/${file}: invalid JSON — ${(e as Error).message}`); }
    if (!Array.isArray(items)) {
      throw new Error(`db/${file}: must be a JSON array`);
    }
    db.hydrate(name, items);
  }
}
```

### Behavior
- Missing `dir` → no-op.
- Non-array seed file → startup error.
- File `users.json` → collection name `users`.

## Acceptance Criteria
- [ ] Empty/missing `db/` is OK.
- [ ] Each `.json` becomes a collection named after the file.
- [ ] Non-array files throw a clear error.
- [ ] Records preserve their original `id`.

## Out of Scope
- Persistence write-back (T-2.05).

## References
- D-022
- [`architecture/11-database.md`](../../architecture/11-database.md)
