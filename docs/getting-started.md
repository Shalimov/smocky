# Getting Started

This guide takes you from zero to a running mock server in three
commands, then explains exactly what got created so you can edit
anything by hand later.

## Prerequisites

- [Bun](https://bun.sh) **≥ 1.1**
- An HTTP client (e.g. `curl`) to call the mocked endpoints

## Install

Inside an existing project (or an empty directory you just `mkdir`'d):

```bash
bun add -d github:YOUR_USER/smocker#v0.1.0
```

> npm publishing is planned; until then, install from a tagged GitHub
> release. Pin to a tag (e.g. `#v0.1.0`) for reproducible installs.

If you cloned this repository to hack on smocker itself, run `bun
install` instead and substitute `bun smocker` with `bun run src/cli/index.ts`
in the commands below.

## The three-command tour

```bash
bun smocker init        # 1. scaffold the project
bun smocker serve       # 2. start the mock server
curl localhost:3000/health
```

That's it. The rest of this page explains what `init` produced and how
to extend it.

## 1. Scaffold a project (`smocker init`)

`smocker init` writes a working scaffold so you don't have to type any
boilerplate. Run it interactively:

```bash
bun smocker init
```

You'll be asked:

- **Project name** — used in the example `health` endpoint body.
- **Port** — default `3000`.
- **Include example endpoints?** — `health`, `users`, `users/_id`.
- **Include a `helpers/` folder?** — adds `helpers/guid.ts`.
- **Include a `db/` folder?** — adds `db/users.json` seed data.
- **Write a `tsconfig.json`?** — Bun-friendly defaults.

Skip the prompts entirely with `--yes` and pick options via flags:

```bash
bun smocker init --yes \
  --name my-api \
  --port 3000 \
  --examples --helpers --no-db --no-tsconfig
```

### …or scaffold from an OpenAPI spec

If you already have an OpenAPI document, generate the entire endpoint
tree from it instead of writing examples:

```bash
# local file
bun smocker init --from-openapi ./openapi.yaml

# remote, with auth
bun smocker init --from-openapi https://api.example.com/openapi.json \
  --header "Authorization: Bearer $TOKEN"
```

Each operation becomes one `endpoints/<path>/response.json`, with
multiple methods merged into the same file. Re-running is additive: new
methods are added, existing ones are preserved (use `--force` to
overwrite).

The full reference for both modes lives at [`features/init.md`](features/init.md).

### What `init` writes

After running `bun smocker init --yes --name my-api --examples --helpers`
you get:

```text
.
├── smocker.config.ts
├── endpoints/
│   ├── health/response.json
│   ├── users/response.json
│   └── users/_id/response.json
└── helpers/
    └── guid.ts
```

If your project has a `package.json`, a `"mock": "smocker serve"`
script is added (skipped if it already exists). `init` will not create
a `package.json` for you.

## 2. Start the server (`smocker serve`)

```bash
bun smocker serve
```

You should see something like:

```
[smocker]
  port:      3000
  baseUrl:   (disabled)
  endpoints: 3 routes (2 static, 1 dynamic)
  helpers:   1
  record:    disabled
```

The server stays in the foreground until you Ctrl-C it. Edits to files
under `endpoints/` and `helpers/` are picked up on the next request —
no restart required.

Common flags:

| Flag | What it does |
|---|---|
| `--port <n>` | Override the configured port |
| `--base-url <url>` | Override `baseUrl` (proxy target) |
| `--config <path>` | Use a non-default config file |
| `--record` | Save proxied responses as new mocks |

## 3. Test it

```bash
curl localhost:3000/health
# {"ok":true,"service":"my-api"}

curl localhost:3000/users
# [{"id":"u1","name":"Alice"}, ...]

curl localhost:3000/users/42
# {"id":"42","name":"User 42"}
```

The last URL works because the scaffold includes a dynamic
`endpoints/users/_id/` folder — the `_id` part captures any value and
exposes it as `req.params.id` in templates and hooks.

## What the scaffolded files look like

If you skipped `init` and want to create everything by hand, this is
exactly what to write.

### `smocker.config.ts`

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://jsonplaceholder.typicode.com',
  globalHeaders: {
    'Access-Control-Allow-Origin': '*',
  },
});
```

`baseUrl` is the upstream API. Anything you don't mock is forwarded
there. Leave it `undefined` (or `''`) to disable the proxy and 404 on
unmatched routes.

### A static mock — `endpoints/health/response.json`

```json
{
  "GET": {
    "status": 200,
    "body": { "ok": true, "service": "my-api" }
  }
}
```

### A dynamic route — `endpoints/users/_id/response.json`

```json
{
  "GET": {
    "body": {
      "id": "{{ req.params.id }}",
      "name": "User-{{ req.params.id }}"
    }
  }
}
```

The `_id` folder declares a dynamic segment. The captured value is
exposed as `req.params.id` to templates and hooks.

### A helper — `helpers/guid.ts`

```ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

Then use it in any `response.json`:

```json
{
  "GET": {
    "body": { "id": "{{ guid }}" }
  }
}
```

Helpers are loaded at server startup; restart after adding one.

### A hook — `endpoints/users/_id/hook.ts`

For conditional logic that doesn't fit in `response.json`:

```ts
import type { Hook } from 'smocker';

const hook: Hook = (req, res) => {
  if (req.params.id === '404') {
    res.status = 404;
    res.body = { error: 'not found' };
  }
};

export default hook;
```

```bash
curl -i localhost:3000/users/404
# HTTP/1.1 404 Not Found
```

## Where to go next

- [`smocker init`](features/init.md) — full reference for the scaffolder, including `--from-openapi`
- [Conventions](features/conventions.md) — the filesystem rules in detail
- [Routing](features/routing.md) — URL → folder mapping, dynamic segments, precedence
- [Templating](features/templating.md) — what you can do inside `{{ }}`
- [Helpers](features/helpers.md) — full helper contract
- [Hooks](features/hooks.md) — full hook contract and patterns
- [Database](features/database.md) — stateful CRUD with `db/`
- [Proxy & Recorder](features/proxy-and-recorder.md) — fall through and capture
- [OpenAPI Checker](features/openapi-checker.md) — guard against drift
- [Configuration](reference/configuration.md) — full config schema
- [CLI & Library API](reference/api.md) — every flag and every export
