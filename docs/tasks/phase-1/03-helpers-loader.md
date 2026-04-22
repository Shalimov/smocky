# Task T-1.03: Helpers Loader

## Status
- [ ] Not started

## Goal
Discover all helper files in `helpersDir`, dynamically import them, and
expose a frozen `name → fn` map for use by the template engine.

## Context
Helpers are the user's hook into dynamic data (UUIDs, timestamps, random
values). Loading happens once at startup (D-032 — no hot reload).

## Inputs / Prerequisites
- T-1.02 complete.
- Read: [`architecture/06-helpers.md`](../../architecture/06-helpers.md).
- Decisions: D-009, D-010, D-032.

## Deliverables
- `src/helpers-loader.ts`

## Implementation Notes

### Discovery & Import
```ts
import { readdir } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';
import type { Helper } from './types';

const RESERVED = new Set(['req', 'db']);

export async function loadHelpers(dir: string): Promise<Map<string, Helper>> {
  const map = new Map<string, Helper>();
  const absDir = resolve(dir);

  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch {
    return map; // helpers dir is optional
  }

  for (const file of entries) {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
    const name = parse(file).name;

    if (RESERVED.has(name)) {
      throw new Error(`helper "${name}" collides with reserved namespace`);
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`invalid helper name "${name}"`);
    }
    if (map.has(name)) {
      throw new Error(`duplicate helper "${name}"`);
    }

    const mod = await import(join(absDir, file));
    if (typeof mod.default !== 'function') {
      throw new Error(`helper "${name}" missing default export function`);
    }
    map.set(name, mod.default as Helper);
  }
  return new Map(map); // frozen by convention; callers don't mutate
}
```

### Error Handling
- Missing `helpersDir`: return empty map silently.
- Bad export / duplicate / reserved name: throw at startup with the
  filename in the message.

## Acceptance Criteria
- [ ] Returns empty map when directory does not exist.
- [ ] Loads `.ts` and `.js` files; ignores other extensions.
- [ ] Rejects helpers named `req` or `db`.
- [ ] Rejects helpers without a default-exported function.
- [ ] Detects duplicate helper names.
- [ ] Verified manually with two example helpers (`guid`, `randomInt`).

## Out of Scope
- Template engine integration (T-1.04 consumes the map).
- Hot reload (D-032).

## References
- D-009, D-010, D-032
- [`architecture/06-helpers.md`](../../architecture/06-helpers.md)
