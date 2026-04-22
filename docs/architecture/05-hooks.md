# 05 — Hooks

Hooks are per-endpoint TypeScript files that run **after** templating and
**before** the response is sent. They mutate the response object in place
(D-012), giving you full programmatic control without leaving the
filesystem-routing model.

## File Location

```
endpoints/<path>/hook.ts
```

A hook lives in the same folder as its `response.json`. If no `hook.ts`
exists, the templated response is returned as-is.

## Signature (D-013, D-014)

```ts
import type { Hook } from 'smocker';

const hook: Hook = async (req, res, ctx) => {
  // mutate res
};

export default hook;
```

`Hook` type:

```ts
type Hook = (
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
) => void | Promise<void>;
```

Hooks may be sync or async. The runner always `await`s the result.

## `req` — Request Snapshot

```ts
interface MockRequest {
  method: string;                        // 'GET'
  path: string;                          // '/users/42'
  params: Record<string, string>;        // { id: '42' }
  query: Record<string, string | string[]>;
  headers: Record<string, string>;       // lowercased keys
  body: unknown;                         // parsed JSON or undefined
  raw: Request;                          // underlying Bun Request
}
```

## `res` — Mutable Response

```ts
interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay: number;
}
```

Mutation is the contract. Returning a value is ignored.

```ts
const hook: Hook = (req, res) => {
  res.status = 418;
  res.headers['X-Hooked'] = 'true';
  res.body = { ...(res.body as object), hooked: true };
};
export default hook;
```

## `ctx` — Shared Context

Phase 1: `{ req }`. Phase 2 adds `ctx.db`.

```ts
interface Ctx {
  req: MockRequest;
  // db: Db;            // Phase 2
}
```

Reserving `ctx` from day one keeps the Phase 2 plumbing non-breaking.

## Execution Model

1. Templated response object is computed.
2. Hook is dynamically imported (cached after first load).
3. `await hook(req, res, ctx)` is called.
4. Resulting `res` proceeds through global header merge → delay → respond.

## Error Handling

Uncaught throws/rejections from a hook produce a `500 Internal Server Error`
with a diagnostic body in development mode. The error is logged with the
endpoint path and method.

```json
{
  "error": "HookError",
  "endpoint": "/users/_id",
  "method": "GET",
  "message": "<original message>"
}
```

## Common Patterns

### Conditional Status

```ts
const hook: Hook = (req, res) => {
  if (req.params.id === 'forbidden') {
    res.status = 403;
    res.body = { error: 'forbidden' };
  }
};
export default hook;
```

### Echoing Request Body

```ts
const hook: Hook = (req, res) => {
  res.body = { received: req.body, at: new Date().toISOString() };
};
export default hook;
```

### Reading Headers

```ts
const hook: Hook = (req, res) => {
  if (!req.headers.authorization) {
    res.status = 401;
    res.body = { error: 'unauthorized' };
  }
};
export default hook;
```

### (Phase 2) Mutating DB

```ts
const hook: Hook = (req, res, ctx) => {
  const users = ctx.db.collection('users');
  const created = users.insert(req.body as object);
  res.status = 201;
  res.body = created;
};
export default hook;
```

## Anti-Patterns

- **Returning a new response object.** Mutate `res` in place instead.
- **Performing long-running I/O.** Hooks block the response — keep them
  fast or use `delay` to simulate latency intentionally.
- **Re-running templates inside a hook.** Templates are already resolved
  by the time the hook runs.

## References

- D-012, D-013, D-014
- [`03-request-lifecycle.md`](03-request-lifecycle.md),
  [`04-templating.md`](04-templating.md)
