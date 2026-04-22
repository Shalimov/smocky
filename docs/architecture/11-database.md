# 11 — Database (Phase 2)

> **Status:** Designed, deferred. Phase 1 reserves `ctx.db` and the `db.*`
> template namespace so this phase ships non-breaking.

The shared in-memory DB makes Smocker feel like a real backend: POST a
record, subsequent GETs reflect it, DELETE removes it, queries filter the
collection. Inspired by **json-server** and **MirageJS** but kept
deliberately small.

## Goals

- Realistic CRUD prototyping without writing handlers for every endpoint.
- Stateful interactions across requests within a single server lifetime.
- Optional persistence so manually crafted seed data isn't lost.

## Non-Goals

- Relational integrity, joins, transactions.
- Migration tooling, schema enforcement.
- Multi-process/multi-server consistency.

## Storage Model (D-022)

Collection-based key/value structure:

```ts
interface Db {
  collection<T = any>(name: string): Collection<T>;
  collections(): string[];
  reset(): void;                     // wipe in-memory state
  flush(): Promise<void>;            // persist to disk if enabled
}
```

```ts
interface Collection<T> {
  all(): T[];
  find(id: string): T | undefined;
  where(match: Partial<T>): T[];
  query(predicate: (item: T) => boolean): T[];

  insert(item: Partial<T>): T;       // assigns id if missing (D-023)
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
}
```

API style: **lightweight custom** (D-024) — not chainable LowDB-style.

## Seeding (D-022)

Seed files live in `db/`. Each `<name>.json` is a JSON array becoming the
initial state of the collection of the same name.

```
db/
├── users.json     → ctx.db.collection('users')
└── posts.json     → ctx.db.collection('posts')
```

```json
// db/users.json
[
  { "id": "u1", "name": "Alice", "active": true },
  { "id": "u2", "name": "Bob",   "active": false }
]
```

If `db/` is absent or empty, the DB starts with no collections. Calling
`db.collection('x')` on an unknown name auto-creates an empty collection.

## ID Generation (D-023)

When `insert()` receives an object without an `id`, a UUID is assigned via
`crypto.randomUUID()`. Other auto-id strategies (incrementing integers) are
intentionally out of scope.

## Persistence (D-022)

```ts
db: { dir: './db', persist: false, autoId: 'uuid' }
```

- `persist: false` (default) — pure in-memory; restarts wipe state.
- `persist: true` — every mutation triggers a debounced write back to the
  corresponding `db/<collection>.json` file.

Debounce window: 100ms. Writes are atomic (write-temp + rename).

## Hook Access (D-025)

Hooks receive the DB through `ctx.db`:

```ts
import type { Hook } from 'smocker';

const hook: Hook = (req, res, ctx) => {
  const users = ctx.db.collection('users');
  res.body = users.where({ active: true });
};
export default hook;
```

Full read/write power.

## Template Access (D-025)

Templates have **read-only** access via the `db.*` namespace:

```json
{
  "GET": {
    "body": {
      "all":  "{{ db.users.all }}",
      "one":  "{{ db.users.find req.params.id }}",
      "live": "{{ db.users.where active=true }}"
    }
  }
}
```

Methods exposed in templates: `all`, `find`, `where` (key=value pairs).
Mutating methods (`insert`, `update`, `remove`) are intentionally **not**
available — use a hook.

Calling `db.x.<unknown>` raises a clear template error.

## Auto-CRUD (Open Question)

A potential ergonomics win: when an endpoint folder named after a DB
collection has **no** `response.json`, generate REST behavior automatically:

| Method  | Path           | Behavior                  |
|---------|----------------|---------------------------|
| GET     | /users         | `users.all()`             |
| GET     | /users/_id     | `users.find(id)` or 404   |
| POST    | /users         | `users.insert(body)`      |
| PUT     | /users/_id     | `users.update(id, body)`  |
| DELETE  | /users/_id     | `users.remove(id)`        |

This is **deferred for a future decision**. The Phase 2 task list includes
it as an open task (`phase-2/06-auto-crud-decision.md`) so the conversation
isn't lost.

## Errors

| Situation                      | Behavior                                |
|--------------------------------|-----------------------------------------|
| Mutating in template           | TemplateError (`use a hook`)            |
| Bad seed file (not array/JSON) | Startup error                           |
| Persistence write failure      | Logged warning; in-memory state intact  |
| `update`/`remove` on missing id| Returns `undefined`/`false`             |

## Forward-Compat From Phase 1

Phase 1 wires `ctx` through the request lifecycle but `ctx.db` is undefined.
The `db.*` template namespace is reserved and throws a descriptive error.
Phase 2 only needs to populate `ctx.db` and lift the template guard.

## References

- D-011, D-013, D-022, D-023, D-024, D-025
- [`05-hooks.md`](05-hooks.md), [`04-templating.md`](04-templating.md)
