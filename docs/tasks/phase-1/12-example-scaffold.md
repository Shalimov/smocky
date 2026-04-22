# Task T-1.12: Example Scaffold

## Status
- [ ] Not started

## Goal
Provide two working endpoint examples and two helper examples so users have
a concrete reference to copy from.

## Context
A good scaffold replaces a thousand words of docs. Showcases dynamic
segments, hooks, request access, and helpers.

## Inputs / Prerequisites
- T-1.10 complete (server runs).
- Read: [`architecture/02-conventions.md`](../../architecture/02-conventions.md),
  [`architecture/04-templating.md`](../../architecture/04-templating.md),
  [`architecture/05-hooks.md`](../../architecture/05-hooks.md).

## Deliverables
- `endpoints/users/response.json`
- `endpoints/users/_id/response.json`
- `endpoints/users/_id/hook.ts`
- `helpers/guid.ts`
- `helpers/randomInt.ts`
- `mock.config.ts` (root, sensible defaults)

## Implementation Notes

### `mock.config.ts`
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
  record: { enabled: false },
});
```

### `endpoints/users/response.json`
```json
{
  "GET": {
    "status": 200,
    "body": {
      "users": [
        { "id": "{{ guid }}", "name": "Alice" },
        { "id": "{{ guid }}", "name": "Bob" }
      ],
      "count": 2,
      "filter": "{{ req.query.filter }}"
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

### `endpoints/users/_id/response.json`
```json
{
  "GET": {
    "status": 200,
    "body": {
      "id": "{{ req.params.id }}",
      "name": "User-{{ req.params.id }}",
      "luckyNumber": "{{ randomInt 1 100 }}"
    }
  },
  "DELETE": {
    "status": 204,
    "body": {}
  }
}
```

### `endpoints/users/_id/hook.ts`
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

### `helpers/guid.ts`
```ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

### `helpers/randomInt.ts`
```ts
export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    throw new Error(`randomInt: invalid bounds "${min}" / "${max}"`);
  }
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
```

## Acceptance Criteria
- [ ] `bun run dev` starts the server with these examples loaded.
- [ ] `curl localhost:3000/users` returns the templated list.
- [ ] `curl localhost:3000/users/42` returns the templated single user
       with a random number.
- [ ] `curl localhost:3000/users/404` returns 404 (hook fired).
- [ ] `curl localhost:3000/posts` (unmocked) is proxied to upstream.

## Out of Scope
- DB-backed examples (Phase 2).
- README write-up (T-1.13).

## References
- D-007, D-008, D-009, D-012
- [`architecture/02-conventions.md`](../../architecture/02-conventions.md)
