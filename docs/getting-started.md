# Getting Started

This guide walks you from zero to a running mock server with one mocked
endpoint, one templated value, and one proxied fallback.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- A frontend or HTTP client to call mocked endpoints

## Install

Inside an existing project:

```bash
bun add smocker
```

Or clone this repository to run the example:

```bash
git clone <repo-url> smocker
cd smocker
bun install
```

## 1. Create `mock.config.ts`

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

`baseUrl` is the upstream API. Anything you don't mock is forwarded there.

## 2. Add Your First Mock

Create `endpoints/health/response.json`:

```json
{
  "GET": {
    "status": 200,
    "body": { "ok": true, "service": "smocker" }
  }
}
```

## 3. Run

```bash
bun run smocker serve
# or, if you cloned this repo:
bun run dev
```

You should see something like:

```
[smocker]
  port:      3000
  baseUrl:   https://jsonplaceholder.typicode.com
  endpoints: 1 routes (1 static, 0 dynamic)
  helpers:   (none)
  record:    disabled
```

Test it:

```bash
curl localhost:3000/health
# {"ok":true,"service":"smocker"}

curl localhost:3000/posts/1
# proxied response from jsonplaceholder.typicode.com
```

## 4. Add a Dynamic Route

Create `endpoints/users/_id/response.json`:

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

```bash
curl localhost:3000/users/42
# {"id":"42","name":"User-42"}
```

The `_id` folder declares a dynamic segment. The captured value is
exposed as `req.params.id` to templates and hooks.

## 5. Add a Helper

Create `helpers/guid.ts`:

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

Restart the server (helpers are loaded at startup).

## 6. Add a Hook

For conditional logic, add `endpoints/users/_id/hook.ts`:

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

## Next Steps

- [Conventions](features/conventions.md) — the filesystem rules in detail
- [Templating](features/templating.md) — what you can do inside `{{ }}`
- [Hooks](features/hooks.md) — full hook contract and patterns
- [Database](features/database.md) — stateful CRUD with `db/`
- [OpenAPI Checker](features/openapi-checker.md) — guard against drift
- [Configuration](reference/configuration.md) — full config schema
