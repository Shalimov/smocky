# Task T-2.01: DB Core

## Status
- [x] Complete (2026-04-22)

## Goal
Implement the in-memory collection store and its query/mutation API per
[`architecture/11-database.md`](../../architecture/11-database.md).

## Context
First Phase 2 task. Pure in-memory; persistence is a separate concern
(T-2.05).

## Inputs / Prerequisites
- All of Phase 1.
- Read: [`architecture/11-database.md`](../../architecture/11-database.md).
- Decisions: D-022, D-023, D-024.

## Deliverables
- `src/db.ts`

## Implementation Notes

### Public API
```ts
export interface Collection<T = any> {
  all(): T[];
  find(id: string): T | undefined;
  where(match: Partial<T>): T[];
  query(predicate: (item: T) => boolean): T[];
  insert(item: Partial<T>): T;
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
}

export interface Db {
  collection<T = any>(name: string): Collection<T>;
  collections(): string[];
  reset(): void;
  flush(): Promise<void>;     // wired by persistence task
  hydrate(name: string, items: any[]): void; // used by loader
}

export function createDb(opts?: { autoId?: 'uuid' }): Db;
```

### Implementation Sketch
```ts
const data = new Map<string, any[]>();

function collection(name) {
  if (!data.has(name)) data.set(name, []);
  const items = data.get(name)!;
  return {
    all: () => [...items],
    find: (id) => items.find(x => x.id === id),
    where: (m) => items.filter(x => Object.entries(m).every(([k,v]) => x[k] === v)),
    query: (p) => items.filter(p),
    insert: (item) => {
      const withId = { id: item.id ?? crypto.randomUUID(), ...item };
      items.push(withId);
      onMutation?.(name);
      return withId;
    },
    update: (id, patch) => {
      const i = items.findIndex(x => x.id === id);
      if (i < 0) return undefined;
      items[i] = { ...items[i], ...patch, id: items[i].id };
      onMutation?.(name);
      return items[i];
    },
    remove: (id) => {
      const i = items.findIndex(x => x.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      onMutation?.(name);
      return true;
    },
  };
}
```

`onMutation` is a hook used later by the persistence layer (T-2.05).

## Acceptance Criteria
- [ ] `insert()` assigns UUID when no `id` given.
- [ ] `find()` returns by id; `undefined` if missing.
- [ ] `where()` matches by all key/value pairs.
- [ ] `update()` merges patch but never changes `id`.
- [ ] `remove()` returns boolean; collection size decreases.
- [ ] Calling `collection('x')` lazily creates an empty collection.

## Out of Scope
- Disk persistence (T-2.05).
- Loading seed data (T-2.02).

## References
- D-022, D-023, D-024
- [`architecture/11-database.md`](../../architecture/11-database.md)
