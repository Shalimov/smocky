# Database

Smocker ships with a small in-memory database so your mocks can behave like
a real backend: POST a record, subsequent GETs reflect it, DELETE removes
it, queries filter the collection. Inspired by **json-server** and
**MirageJS** but kept deliberately minimal.

State lives for the lifetime of one server process. Optional persistence
writes mutations back to disk so seed data isn't lost across restarts.

## What It's Good For

- Realistic CRUD prototyping without writing a handler for every endpoint.
- Stateful flows across requests (e.g. "create then read").
- Reading collections directly from templates.

## What It Isn't

- A relational store. No joins, transactions, or schema enforcement.
- Multi-process safe — one server, one DB.

## Seeding

Drop JSON arrays into `db/`. Each `<name>.json` becomes a collection of the
same name.

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

If `db/` is missing or empty, the DB starts empty. Calling
`db.collection('x')` on an unknown name auto-creates an empty collection.

## Configuration

```ts
// smocker.config.ts
db: {
  dir: './db',
  persist: false,
  autoId: 'uuid',
}
```

| Field     | Default    | Notes                                                |
|-----------|------------|------------------------------------------------------|
| `dir`     | `./db`     | Folder containing seed `*.json` files                |
| `persist` | `false`    | When `true`, mutations are written back to `dir`     |
| `autoId`  | `'uuid'`   | Strategy for generating IDs on insert                |

### Persistence

- `persist: false` — pure in-memory; restarts wipe state.
- `persist: true` — every mutation triggers a debounced (100 ms) atomic
  write back to `db/<collection>.json`.

Write failures are logged as warnings; in-memory state is never lost.

## Reading From Templates

Templates have **read-only** access via the `db.*` namespace:

```json
{
  "GET": {
    "body": {
      "all":    "{{ db.users.all }}",
      "one":    "{{ db.users.find req.params.id }}",
      "active": "{{ db.users.where active=true }}"
    }
  }
}
```

Available methods in templates:

| Token                            | Returns                              |
|----------------------------------|--------------------------------------|
| `db.<col>.all`                   | All items                            |
| `db.<col>.find <id>`             | One item by `id`, or `undefined`     |
| `db.<col>.where key=value …`     | Items matching all key/value pairs   |

Mutating methods (`insert`, `update`, `remove`) are intentionally **not**
exposed to templates — use a hook.

Calling an unknown method (`{{ db.users.delete … }}`) raises a clear
template error.

## Writing From Hooks

Hooks get full access through `ctx.db`:

```ts
import type { Hook } from 'smocker';

const hook: Hook = (req, res, ctx) => {
  const users = ctx.db!.collection<{ id?: string; name: string; active?: boolean }>('users');

  switch (req.method) {
    case 'GET':
      res.body = users.all();
      return;
    case 'POST':
      res.status = 201;
      res.body = users.insert(req.body as { name: string });
      return;
    case 'DELETE':
      res.status = users.remove(req.params.id) ? 204 : 404;
      res.body = null;
      return;
  }
};

export default hook;
```

### Collection API

```ts
interface Collection<T> {
  all(): T[];
  find(id: string): T | undefined;
  where(match: Partial<T>): T[];
  query(predicate: (item: T) => boolean): T[];

  insert(item: Partial<T>): T;          // assigns id if missing
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
}
```

### Db API

```ts
interface Db {
  collection<T>(name: string): Collection<T>;
  collections(): string[];
  reset(): void;                        // wipe in-memory state
  flush(): Promise<void>;               // force persistence to disk
}
```

All reads and writes return **deep clones**, so mutating the result of
`all()` or `find()` does not affect stored state.

## ID Generation

`insert()` accepts items with or without an `id`:

- If `id` is a non-empty string, it's used as-is.
- Otherwise, a UUID is assigned via `crypto.randomUUID()`.

Other strategies (auto-increment, etc.) are out of scope.

## Errors

| Situation                        | Behavior                              |
|----------------------------------|---------------------------------------|
| Mutating method called in template | Template error                      |
| Bad seed file (not a JSON array) | Startup error                         |
| Persistence write failure        | Logged warning; state intact          |
| `update`/`remove` on missing id  | Returns `undefined` / `false`         |

## End-to-End Example

`db/users.json`:

```json
[{ "id": "u1", "name": "Alice", "active": true }]
```

`endpoints/users/response.json`:

```json
{
  "GET":  { "body": "{{ db.users.all }}" },
  "POST": { "status": 201 }
}
```

`endpoints/users/hook.ts`:

```ts
import type { Hook } from 'smocker';

const hook: Hook = (req, res, ctx) => {
  if (req.method !== 'POST') return;
  const users = ctx.db!.collection<{ name: string; active?: boolean }>('users');
  res.body = users.insert(req.body as { name: string });
};

export default hook;
```

Try it:

```bash
curl localhost:3000/users
curl -X POST localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"Cara","active":true}'
curl localhost:3000/users
```
