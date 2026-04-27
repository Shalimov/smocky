# Smocky

Convention-over-configuration mock server for Bun.

## Why Smocky?

- Mock only the endpoints you need and proxy everything else.
- Keep mocks as files instead of custom middleware glue.
- Add dynamic values with templates, helpers, and hooks.

Read more: [docs/README.md](docs/README.md)

## Getting Started

### Requirements

- [Bun](https://bun.sh) **≥ 1.1**
- An empty directory (or an existing project) where smocky should live

### 1. Install

Inside any project:

```bash
bun add -d github:YOUR_USER/smocky#v0.1.0
```

> npm publishing is planned. Until then, install from a tagged GitHub
> release and pin the tag (e.g. `#v0.1.0`) for reproducible installs.

### 2. Scaffold a project with `smocky init`

The fastest way to bootstrap is to let `smocky init` write the files
for you. Two flavors:

**Interactive (recommended for first-time use):**

```bash
bun smocky init
```

You'll be asked for a project name, port, and which optional pieces to
include (example endpoints, a `helpers/` folder, a seeded `db/`, a
`tsconfig.json`). Answer the prompts and you'll end up with:

```text
.
├── smocky.config.ts
├── endpoints/
│   ├── health/response.json
│   ├── users/response.json
│   └── users/_id/response.json
└── helpers/guid.ts          # if you opted in
```

**Non-interactive (CI, scripts):**

```bash
bun smocky init --yes --name my-api --port 3000 --examples --helpers
```

**From an OpenAPI spec:**

```bash
# Local file
bun smocky init --from-openapi ./openapi.yaml

# Remote, with auth
bun smocky init --from-openapi https://api.example.com/openapi.json \
  --header "Authorization: Bearer $TOKEN"
```

This generates one `endpoints/<path>/response.json` per operation in the
spec, merging multiple methods (`GET`/`POST`/`DELETE`) into a single
file per folder. Re-running is additive: missing methods get added,
existing ones are preserved (use `--force` to overwrite).

Full reference: [`docs/features/init.md`](docs/features/init.md).

### 3. Run the server

```bash
bun smocky serve
```

You should see a startup banner and the server begins listening on
`http://localhost:3000`. Hit your mocks with `curl`:

```bash
curl localhost:3000/health
# {"ok":true,"service":"my-api"}

curl localhost:3000/users/42
# {"id":"42","name":"User 42"}
```

If you configured a `baseUrl` in `smocky.config.ts`, anything you
haven't mocked is transparently proxied to the real backend.

### 4. Iterate

Read the [Folder
Conventions](docs/features/conventions.md) for the rules, then dive
into [Templating](docs/features/templating.md), [Hooks](docs/features/hooks.md),
or the [Database](docs/features/database.md) when you need more.

> Step-by-step walkthrough that builds the same scaffold by hand:
> [`docs/getting-started.md`](docs/getting-started.md).

---

### Hacking on smocky itself

If you cloned this repo (rather than installing the package):

```bash
bun install
bun run dev          # equivalent to: bun run src/cli/index.ts serve
```

The bundled example `smocky.config.ts` proxies unmocked routes to
`https://jsonplaceholder.typicode.com`, so you can immediately try:

```bash
curl localhost:3000/users        # mocked
curl localhost:3000/posts        # proxied
```

## Folder Conventions

```text
.
├── smocky.config.ts
├── endpoints/
│   └── users/
│       ├── response.json
│       └── _id/
│           ├── hook.ts
│           └── response.json
└── helpers/
    ├── guid.ts
    └── randomInt.ts
```

- `endpoints/<path>/response.json` defines method responses.
- `_param` folders become dynamic route params.
- `hook.ts` mutates the response after templating.
- `helpers/*.ts` are callable from `{{ ... }}` tokens.

Read more: [docs/features/conventions.md](docs/features/conventions.md)

## Writing a Mock

Static and multi-method mock:

```json
{
  "GET": {
    "status": 200,
    "body": {
      "users": [
        { "id": "{{ guid }}", "name": "Alice" },
        { "id": "{{ guid }}", "name": "Bob" }
      ]
    }
  },
  "POST": {
    "status": 201,
    "body": {
      "id": "{{ guid }}",
      "echo": "{{ req.body.name }}"
    }
  }
}
```

Dynamic route example:

```json
{
  "GET": {
    "body": {
      "id": "{{ req.params.id }}",
      "name": "User-{{ req.params.id }}",
      "luckyNumber": "{{ randomInt 1 100 }}"
    }
  }
}
```

Read more: [docs/features/routing.md](docs/features/routing.md)

## Templating

- `{{ req.params.id }}` reads request data.
- `{{ guid }}` calls a helper and preserves its return type when it is the whole string.
- `user-{{ req.params.id }}` stringifies and embeds the value.
- `{{ randomInt 1 100 }}` passes helper arguments as strings.

Read more: [docs/features/templating.md](docs/features/templating.md)

## Helpers

```ts
// helpers/guid.ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

```ts
// helpers/randomInt.ts
export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    throw new Error(`randomInt: invalid bounds "${min}" / "${max}"`);
  }
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
```

Read more: [docs/features/helpers.md](docs/features/helpers.md)

## Hooks

```ts
import type { Hook } from 'smocky';

const hook: Hook = (req, res) => {
  if (req.params.id === '404') {
    res.status = 404;
    res.body = { error: 'not found', id: req.params.id };
  }

  res.headers['x-hooked'] = 'true';
};

export default hook;
```

Use a hook when you need conditional logic or response mutation that would be awkward in `response.json` alone.

Read more: [docs/features/hooks.md](docs/features/hooks.md)

## Stateful Mocks

Smocky ships with a small in-memory DB seeded from `db/*.json`.

```json
// db/users.json
[
  { "id": "u1", "name": "Alice", "active": true },
  { "id": "u2", "name": "Bob", "active": false }
]
```

Templates can read from the DB:

```json
{
  "GET": {
    "body": {
      "users": "{{ db.users.all }}",
      "activeUsers": "{{ db.users.where active=true }}"
    }
  }
}
```

Hooks can mutate it:

```ts
import type { Hook } from 'smocky';

const hook: Hook = (req, res, ctx) => {
  const users = ctx.db!.collection('users');

  if (req.method === 'POST') {
    res.body = users.insert(req.body as { name: string; active?: boolean });
    res.status = 201;
  }
};

export default hook;
```

Typical flow:

```bash
curl localhost:3000/users
curl -X POST localhost:3000/users -H 'content-type: application/json' -d '{"name":"Cara","active":true}'
curl localhost:3000/users
```

Persistence stays opt-in through `smocky.config.ts -> db.persist`.

Read more: [docs/features/database.md](docs/features/database.md)

## Record Mode

Enable recording for a run:

```bash
bun smocky serve --record
```

Or set it in `smocky.config.ts`:

```ts
record: {
  enabled: true,
  include: ['/api/'],
  exclude: ['/health'],
  overwrite: false,
}
```

Only JSON upstream responses are recorded.

Read more: [docs/features/proxy-and-recorder.md](docs/features/proxy-and-recorder.md)

## Configuration Reference

```ts
import { defineConfig } from 'smocky';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://jsonplaceholder.typicode.com',
  endpointsDir: './endpoints',
  helpersDir: './helpers',
  globalHeaders: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
  },
  record: {
    enabled: false,
    outputDir: './endpoints',
    include: [],
    exclude: [],
    overwrite: false,
  },
  db: {
    dir: './db',
    persist: false,
    autoId: 'uuid',
  },
});
```

Environment overrides:

- `PORT`
- `BASE_URL`
- `RECORD=1`

Read more: [docs/reference/configuration.md](docs/reference/configuration.md)

## Library Use

```ts
import { Smocky, startServer } from 'smocky';

// Quick start with startServer
const server = await startServer({ port: 4000 });
await server.stop();

// Full control with the Smocky class (workspace support)
const instance = await Smocky.start({
  port: 4000,
  workspace: 'user-tests',
});
await instance.stop();
```

Read more: [docs/reference/api.md](docs/reference/api.md)

## CLI Reference

```text
smocky serve [--config <path>] [--port <n>] [--base-url <url>] [--record]
smocky check api   [--fail] [--base-url <url>]
smocky check mocks [--fail]
smocky check all   [--fail] [--base-url <url>]
smocky init [--yes] [--name <s>] [--port <n>]
             [--examples|--no-examples] [--helpers|--no-helpers]
             [--db|--no-db] [--tsconfig|--no-tsconfig]
             [--cwd <dir>] [--force]
smocky init --from-openapi <spec> [--header "Name: value" ...]
             [--yes] [--cwd <dir>] [--force]
```

Common flags:

- `--config <path>` — alternate `smocky.config.ts` location.
- `--port <n>` — override the configured port.
- `--base-url <url>` — applies to both `serve` and `check`, so the
  checker can target a different backend without editing config.
- `--record` — record proxied responses as new mocks.
- `--fail` — `check` exits with status 1 on any drift.
- `--help`, `--version` — standard.

Read more: [docs/features/init.md](docs/features/init.md) · [docs/reference/api.md](docs/reference/api.md)

## OpenAPI Checker

Smocky ships with a CLI checker that compares your OpenAPI spec against:

- the local mocks under `endpoints/`
- the real backend at `baseUrl`

Quick start:

```bash
bun smocky check mocks
bun smocky check api --base-url http://127.0.0.1:3000
bun smocky check all --fail --base-url http://127.0.0.1:3000
```

The bundled example config points `baseUrl` at `https://jsonplaceholder.typicode.com`, which does not match the bundled `/users` spec. For a green end-to-end example, run the local server and point `check api` back at smocky itself:

```bash
bun smocky serve --base-url ""
bun smocky check api --base-url http://127.0.0.1:3000
```

Sample overrides live in `openapi.check.sampleData` and are keyed by either `operationId` or `<METHOD> <path>`:

```json
{
  "POST /users": {
    "name": "Example User",
    "active": true
  },
  "createUser": {
    "name": "Example User",
    "active": true
  }
}
```

You can skip endpoints with `openapi.check.skipPaths`:

```ts
openapi: {
  spec: './examples/openapi.json',
  check: {
    skipPaths: ['/internal/', /^\/health/],
  },
}
```

Output is text-only in v1.

Read more: [docs/features/openapi-checker.md](docs/features/openapi-checker.md)

## Documentation

Full docs live in [docs/README.md](docs/README.md).
