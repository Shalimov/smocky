# Smocker

Convention-over-configuration mock server for Bun.

## Why Smocker?

- Mock only the endpoints you need and proxy everything else.
- Keep mocks as files instead of custom middleware glue.
- Add dynamic values with templates, helpers, and hooks.

Read more: [docs/architecture/01-overview.md](docs/architecture/01-overview.md)

## Quick Start

```bash
bun install
bun run dev
curl localhost:3000/users
curl localhost:3000/users/42
curl localhost:3000/posts
```

The included `mock.config.ts` proxies unmocked routes to `https://jsonplaceholder.typicode.com`.

Read more: [docs/architecture/03-request-lifecycle.md](docs/architecture/03-request-lifecycle.md)

## Folder Conventions

```text
.
├── mock.config.ts
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

Read more: [docs/architecture/02-conventions.md](docs/architecture/02-conventions.md)

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

Read more: [docs/architecture/07-routing.md](docs/architecture/07-routing.md)

## Templating

- `{{ req.params.id }}` reads request data.
- `{{ guid }}` calls a helper and preserves its return type when it is the whole string.
- `user-{{ req.params.id }}` stringifies and embeds the value.
- `{{ randomInt 1 100 }}` passes helper arguments as strings.

Read more: [docs/architecture/04-templating.md](docs/architecture/04-templating.md)

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

Read more: [docs/architecture/06-helpers.md](docs/architecture/06-helpers.md)

## Hooks

```ts
import type { Hook } from 'smocker';

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

Read more: [docs/architecture/05-hooks.md](docs/architecture/05-hooks.md)

## Stateful Mocks

Phase 2 adds a shared in-memory DB seeded from `db/*.json`.

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
import type { Hook } from 'smocker';

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

Persistence stays opt-in through `mock.config.ts -> db.persist`.

Read more: [docs/architecture/11-database.md](docs/architecture/11-database.md)

## Record Mode

Enable recording for a run:

```bash
bun run src/index.ts serve --record
```

Or set it in `mock.config.ts`:

```ts
record: {
  enabled: true,
  include: ['/api/'],
  exclude: ['/health'],
  overwrite: false,
}
```

Only JSON upstream responses are recorded.

Read more: [docs/architecture/08-proxy-and-recorder.md](docs/architecture/08-proxy-and-recorder.md)

## Configuration Reference

```ts
import { defineConfig } from 'smocker';

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

Read more: [docs/architecture/09-configuration.md](docs/architecture/09-configuration.md)

## Library Use

```ts
import { startServer } from 'smocker';

const server = await startServer({ port: 4000 });

// later
await server.stop();
```

Read more: [docs/architecture/10-public-api.md](docs/architecture/10-public-api.md)

## CLI Reference

```text
smocker [serve]
smocker check api
smocker check mocks
smocker check all
```

Flags:

- `--config <path>`
- `--port <n>`
- `--base-url <url>`
- `--record`
- `--fail`
- `--help`
- `--version`

`--base-url` applies to both `serve` and `check`, which makes it easy to point the checker at a different backend without editing `mock.config.ts`.

Read more: [docs/architecture/10-public-api.md](docs/architecture/10-public-api.md)

## OpenAPI Checker

Phase 3 adds a CLI checker that compares your OpenAPI spec against:

- the local mocks under `endpoints/`
- the real backend at `baseUrl`

Quick start:

```bash
bun run src/index.ts check mocks
bun run src/index.ts check api --base-url http://127.0.0.1:3000
bun run src/index.ts check all --fail --base-url http://127.0.0.1:3000
```

The bundled example config points `baseUrl` at `https://jsonplaceholder.typicode.com`, which does not match the bundled `/users` spec. For a green end-to-end example, run the local server and point `check api` back at Smocker itself:

```bash
bun run src/index.ts serve --base-url ""
bun run src/index.ts check api --base-url http://127.0.0.1:3000
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

Read more: [docs/architecture/12-openapi-checker.md](docs/architecture/12-openapi-checker.md)

## Roadmap

- Shared in-memory DB.
- OpenAPI checker.

See the implementation roadmap in [docs/README.md](docs/README.md).
