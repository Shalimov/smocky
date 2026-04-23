# `smocky init`

Scaffold a new Smocky project — either blank or pre-populated from an
OpenAPI spec — without copy-pasting boilerplate.

`init` works in two mutually exclusive modes:

| Mode | Command | What you get |
|---|---|---|
| **Blank** | `smocky init` | `smocky.config.ts`, two example endpoints, optional helper, optional `db/`, optional `tsconfig.json` |
| **From OpenAPI** | `smocky init --from-openapi <spec>` | One `endpoints/<path>/response.json` per operation in the spec, with method blocks merged per folder |

Both modes are **non-destructive by default**: existing files are skipped
(reported as `- skipped`). Pass `--force` to overwrite.

`<spec>` may be a local file (`./openapi.yaml`, `./openapi.json`) or a
URL (`https://example.com/openapi.json`).

---

## Blank scaffold

Run with no flags for an interactive walkthrough:

```bash
bun smocky init
```

You'll be asked for:

- **Project name** — used in the example `health` endpoint body.
- **Port** — default `3000`.
- **Include example endpoints?** — `health`, `users`, `users/_id`.
- **Include a `helpers/` folder?** — adds `helpers/guid.ts`.
- **Include a `db/` folder?** — adds `db/users.json` seed data.
- **Write a `tsconfig.json`?** — Bun-friendly defaults; skip if you
  already have one.

### Non-interactive mode

Pass `--yes` (or run in a non-TTY context like CI) and everything falls
back to flag values + sensible defaults:

```bash
bun smocky init --yes \
  --name my-api \
  --port 4000 \
  --examples \
  --helpers \
  --db \
  --tsconfig
```

Available flags:

| Flag | Default | Notes |
|---|---|---|
| `--name <string>` | `myapp` | Used in the `health` example. |
| `--port <number>` | `3000` | Written to `smocky.config.ts`. |
| `--examples` / `--no-examples` | `true` | Toggle the example endpoints. |
| `--helpers` / `--no-helpers` | `true` | Toggle `helpers/guid.ts`. |
| `--db` / `--no-db` | `false` | Toggle `db/users.json`. |
| `--tsconfig` / `--no-tsconfig` | `false` | Toggle root `tsconfig.json`. |
| `--cwd <dir>` | `.` | Target directory. |
| `--force` | `false` | Overwrite existing files instead of skipping. |
| `--yes` | `false` | Skip prompts entirely. |

### Output (typical)

```
+ smocky.config.ts
+ endpoints/health/response.json
+ endpoints/users/response.json
+ endpoints/users/_id/response.json
+ helpers/guid.ts
- package.json (skipped)        # patched in place if present
```

If your project has a `package.json`, `init` adds a `"mock": "smocky
serve"` script (skipping if the script already exists). It will not
create a `package.json` for you.

---

## From OpenAPI

```bash
bun smocky init --from-openapi ./openapi.yaml
bun smocky init --from-openapi https://api.example.com/openapi.json
```

Authenticate URL-fetched specs with repeatable `--header`:

```bash
bun smocky init \
  --from-openapi https://api.example.com/openapi.json \
  --header "Authorization: Bearer $TOKEN" \
  --header "X-Org-Id: 42"
```

### Interactive flow

1. **Spec is loaded** and `$ref`s are resolved (local files and URLs alike).
2. You pick which **tags** to include (defaults to all).
3. You pick which **operations** within those tags (defaults to all).
4. You choose the **body strategy**:
   - Use schema `example` / `examples` values when present.
   - Generate fake data with `json-schema-faker` for everything else.

### Non-interactive mode

`--yes` (or non-TTY) selects every operation and uses both examples
and faker fallback:

```bash
bun smocky init --from-openapi ./openapi.json --yes
```

### Path mapping

OpenAPI paths translate directly to folder layout, with `{param}`
becoming `_param`:

| Spec path | Generated file |
|---|---|
| `/health` | `endpoints/health/response.json` |
| `/users` | `endpoints/users/response.json` |
| `/users/{id}` | `endpoints/users/_id/response.json` |
| `/orgs/{orgId}/repos/{repo}` | `endpoints/orgs/_orgId/repos/_repo/response.json` |

Multiple methods on the same path collapse into one file:

```jsonc
// endpoints/users/_id/response.json
{
  "GET":    { "status": 200, "body": { /* ... */ } },
  "PUT":    { "status": 200, "body": { /* ... */ } },
  "DELETE": { "status": 204, "body": {} }
}
```

### Body generation rules

For each operation, smocky picks **one** response in this order:
`200` → `201` → first `2XX` → `2XX` → `default` → first listed.

Then for that response's content:

1. **`application/json` with `example`** — use it verbatim.
2. **`application/json` with `examples`** — use the first one.
3. **`application/json` with `schema`** (and faker enabled) — generate a
   sample via `json-schema-faker`.
4. **No JSON content type** — fall back to the first content type, use
   its example if any (string body + `content-type` header set), else
   write an empty string.
5. **No content** (e.g. `204`) — empty `{}` body.

### Re-running on an existing scaffold

`init --from-openapi` is idempotent and additive by default:

- New endpoint folders are created.
- For folders that already exist, missing methods are **merged in**
  (your hand-edited `GET` survives; a new `DELETE` from the spec is
  appended).
- An existing `smocky.config.ts` is left untouched.

Pass `--force` to fully overwrite each `response.json` with freshly
generated content.

### Warnings

After writing, smocky prints any per-operation issues:

```
! POST /uploads: only multipart/form-data response, body left empty
! GET /weird/{x y}: unsupported path segments, skipped
```

These are advisory — generation continues for everything else.

---

## What `init` will not do

- It will not create a `package.json`.
- It will not install dependencies.
- It will not overwrite files unless you pass `--force`.
- It will not start the server. Run `bun smocky serve` next.

## Limitations (v0.1)

- Faker-generated bodies for schemas with open `additionalProperties`
  may include lorem-ipsum noise. Tighten your schema or pre-supply an
  `example` to stop that.
- Only Bun is supported as a runtime for the CLI itself.
- Only `application/json` and a single non-JSON content type per
  operation are emitted; multipart and streaming are not modelled.
