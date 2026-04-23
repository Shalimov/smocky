# Conventions

Smocky is driven by **filesystem conventions**. Folders define routes,
filenames declare intent, and the absence of a file means "use the default."

## Top-Level Layout

```
your-project/
├── smocky.config.ts           # configuration
├── endpoints/               # mocked routes
├── helpers/                 # template helpers
└── db/                      # optional collection seed files
```

All directory names are configurable through `smocky.config.ts`.

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

### Dynamic Segments — `_name`

Folders prefixed with `_` represent dynamic URL segments. The character after
the underscore is the parameter name exposed as `req.params.<name>`.

```
endpoints/users/_id/         → /users/:id
endpoints/orgs/_org/users/   → /orgs/:org/users
```

### Static Beats Dynamic

When two paths could match, the static one wins:

```
endpoints/users/me/          ← matches /users/me
endpoints/users/_id/         ← matches /users/<anything else>
```

See [Routing](routing.md) for the full algorithm.

### `response.json`

A single file per endpoint, keyed by HTTP method:

```json
{
  "GET":  { "status": 200, "body": { "ok": true } },
  "POST": { "status": 201, "body": { "created": true } }
}
```

Supported keys per method block:

| Field   | Default              |
|---------|----------------------|
| status  | `200`                |
| headers | `{}`                 |
| body    | `{}`                 |
| delay   | `0` (milliseconds)   |

See [Templating](templating.md) for body interpolation rules.

### `hook.ts`

Optional. When present, runs after templating and may mutate the response.
See [Hooks](hooks.md).

## `helpers/` Layout

Flat folder; each file = one helper. Filename (without `.ts`) is the helper
name used inside templates. See [Helpers](helpers.md).

```
helpers/
├── guid.ts
├── randomInt.ts
└── now.ts
```

## `db/` Layout

```
db/
├── users.json               # array of records
└── posts.json
```

Each file is a JSON array. Records may include an `id`; if missing, a UUID
is assigned on insert. See [Database](database.md).

## Reserved Names

| Name                 | Reason                                              |
|----------------------|-----------------------------------------------------|
| `_*` folders         | Dynamic URL segments                                |
| `response.json`      | Endpoint response definition                        |
| `hook.ts` / `hook.js`| Endpoint hook                                       |
| `req`, `db` helpers  | Reserved template namespaces (rejected at startup)  |

## Trailing Slashes & Casing

- Trailing slashes are normalized away (`/users/` ≡ `/users`).
- Path matching is case-sensitive (matches typical REST behavior).
- HTTP methods are matched case-insensitively (`GET` ≡ `get`).
