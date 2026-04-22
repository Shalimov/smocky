# Hooks

Hooks are per-endpoint TypeScript files that run **after** templating and
**before** the response is sent. They mutate the response object in place,
giving you full programmatic control without leaving the filesystem-routing
model.

## File Location

```
endpoints/<path>/hook.ts
```

A hook lives in the same folder as its `response.json`. If no `hook.ts`
(or `hook.js`) exists, the templated response is returned as-is.

## Signature

```ts
import type { Hook } from 'smocker';

const hook: Hook = async (req, res, ctx) => {
  // mutate res
};

export default hook;
```

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
  res.headers['x-hooked'] = 'true';
  res.body = { ...(res.body as object), hooked: true };
};
export default hook;
```

## `ctx` — Shared Context

```ts
interface Ctx {
  req: MockRequest;
  db?: Db;            // available when seeded or used via mock.config.ts
}
```

See [Database](database.md) for `ctx.db` usage.

## Execution Model

1. Templated response object is computed.
2. Hook is dynamically imported (cached after first load).
3. `await hook(req, res, ctx)` is called.
4. Resulting `res` proceeds through global header merge → delay → respond.

## Error Handling

Uncaught throws/rejections from a hook produce a `500 Internal Server
Error` with a diagnostic body. The error is logged with the endpoint path
and method.

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

### Auth Guard via Headers

```ts
const hook: Hook = (req, res) => {
  if (!req.headers.authorization) {
    res.status = 401;
    res.body = { error: 'unauthorized' };
  }
};
export default hook;
```

### CRUD Against the In-Memory DB

```ts
const hook: Hook = (req, res, ctx) => {
  const users = ctx.db!.collection('users');

  if (req.method === 'POST') {
    res.body = users.insert(req.body as { name: string });
    res.status = 201;
  }
};
export default hook;
```

### Simulating Latency

```ts
const hook: Hook = (_req, res) => {
  res.delay = 750; // milliseconds, applied before respond
};
export default hook;
```

## Anti-Patterns

- **Returning a new response object.** Mutate `res` in place instead.
- **Performing long-running I/O.** Hooks block the response — keep them
  fast or use `delay` to simulate latency intentionally.
- **Re-running templates inside a hook.** Templates are already resolved
  by the time the hook runs.
