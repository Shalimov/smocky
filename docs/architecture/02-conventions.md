# 02 — Conventions

Smocker is driven by **filesystem conventions**. Folders define routes,
filenames declare intent, and the absence of a file means "use the default."

## Top-Level Layout

```
<project-root>/
├── mock.config.ts           # configuration (D-018)
├── endpoints/               # mocked routes
├── helpers/                 # template helpers
└── db/                      # Phase 2 — collection seed files
```

The directories are configurable through `mock.config.ts` but default to the
names above.

## `endpoints/` Layout

Each route lives in its own folder. The folder path mirrors the URL path.

```
endpoints/
├── users/
│   ├── response.json
│   ├── hook.ts                  # optional
│   └── _id/
│       ├── response.json
│       └── hook.ts
└── health/
    └── response.json
```

| URL                | Folder                          |
|--------------------|---------------------------------|
| `/users`           | `endpoints/users/`              |
| `/users/123`       | `endpoints/users/_id/`          |
| `/health`          | `endpoints/health/`             |

### Dynamic Segments — `_name` (D-001)

Folders prefixed with `_` represent dynamic URL segments. The character after
the underscore is the parameter name exposed as `req.params.<name>`.

```
endpoints/users/_id/         → /users/:id
endpoints/orgs/_org/users/   → /orgs/:org/users
```

### Static Beats Dynamic (D-003)

When two paths could match, the static one wins:

```
endpoints/users/me/          ← matches /users/me
endpoints/users/_id/         ← matches /users/<anything else>
```

### `response.json` (D-002, D-004)

A single file per endpoint, keyed by HTTP method:

```json
{
  "GET": { "status": 200, "body": { "ok": true } },
  "POST": { "status": 201, "body": { "created": true } }
}
```

See [`04-templating.md`](04-templating.md) for body interpolation rules and
[`09-configuration.md`](09-configuration.md) for the full schema.

### `hook.ts` (D-012)

Optional. When present, runs after templating and may mutate the response:

```ts
import type { Hook } from 'smocker';

const hook: Hook = (req, res, ctx) => {
  if (req.params.id === '404') {
    res.status = 404;
    res.body = { error: 'not found' };
  }
};

export default hook;
```

## `helpers/` Layout (D-007, D-009)

Flat folder; each file = one helper. Filename (without `.ts`) is the helper
name used inside templates.

```
helpers/
├── guid.ts
├── randomInt.ts
└── now.ts
```

```ts
// helpers/guid.ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

Used inside JSON values:

```json
{ "GET": { "body": { "id": "{{ guid }}" } } }
```

## `db/` Layout (Phase 2 — D-022, D-023)

```
db/
├── users.json               # array of records
└── posts.json
```

Each file is a JSON array. Records may include an `id`; if missing, a UUID
is assigned on insert.

## Reserved Names

| Name                 | Reason                                              |
|----------------------|-----------------------------------------------------|
| `_*` folders         | Dynamic URL segments                                |
| `response.json`      | Endpoint response definition                        |
| `hook.ts`            | Endpoint hook                                       |
| `db.*` template ns   | Phase 2 DB access — reserved in Phase 1 (D-011)     |

## Trailing Slashes & Casing

- Trailing slashes are normalized away (`/users/` ≡ `/users`).
- Path matching is case-sensitive (matches typical REST behavior).
- HTTP methods are matched case-insensitively (`GET` ≡ `get`).

## References

- D-001, D-002, D-003, D-004, D-007, D-009, D-011, D-012, D-018, D-022, D-023
- [`07-routing.md`](07-routing.md) for the matching algorithm
- [`04-templating.md`](04-templating.md) for templating syntax
