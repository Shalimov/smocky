# 08 — Proxy and Recorder

When the router fails to match a request, it falls through to the **proxy**.
Optionally, the **recorder** persists the upstream response as a stub for
future use.

## Transparent Proxy (D-015)

The goal is to behave as a pass-through that the upstream API cannot
distinguish from a direct client call.

### Forwarding Rules

| Aspect          | Behavior                                              |
|-----------------|-------------------------------------------------------|
| URL             | `baseUrl + req.path + req.search`                     |
| Method          | Forwarded unchanged                                   |
| Headers         | Forwarded; hop-by-hop headers stripped                |
| `Host` header   | Replaced with the upstream host                       |
| Body            | Streamed (not buffered) when possible                 |
| Status          | Returned unchanged                                    |
| Response headers| Returned unchanged                                    |
| Response body   | Streamed back to the client                           |

### Hop-by-Hop Headers Stripped

Per RFC 7230 §6.1:

```
Connection
Keep-Alive
Proxy-Authenticate
Proxy-Authorization
TE
Trailer
Transfer-Encoding
Upgrade
```

### Implementation Sketch

```ts
async function proxy(req: Request, baseUrl: string): Promise<Response> {
  const url = new URL(req.url);
  const upstream = new URL(url.pathname + url.search, baseUrl);

  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set('host', upstream.host);

  return await fetch(upstream, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    redirect: 'manual',
  });
}
```

### Errors

| Condition          | Response                                              |
|--------------------|-------------------------------------------------------|
| Network failure    | 502 with `{ error: 'ProxyError', message }`           |
| Timeout            | 504 with `{ error: 'ProxyTimeout' }`                  |
| Invalid `baseUrl`  | 500 logged at startup; requests get 502               |

## Recorder (D-016, D-017)

When `record.enabled === true`, the recorder inspects each successfully
proxied response and may persist it to `endpoints/`.

### Configuration

```ts
record: {
  enabled: false,
  outputDir: './endpoints',
  exclude: ['/health', /^\/internal\//],
  include: ['/api/'],
  overwrite: false,
}
```

### Filter Precedence

1. **Exclude** is checked first. Match → skip.
2. If `include` is non-empty, the path must match. Otherwise → skip.
3. Otherwise → record.

Strings match by **prefix** (`/api/` matches `/api/users`).
RegExps match the **full path**.

### Path → Folder Conversion

```
/users           → endpoints/users/
/users/123       → endpoints/users/123/
/users/123/posts → endpoints/users/123/posts/
```

> ⚠️ Numeric IDs become **literal folders**, not `_id`. The user is expected
> to refactor recorded stubs into dynamic segments manually after recording.
> Auto-detection of dynamic segments is intentionally out of scope.

### File Format

The recorder writes a schema-formatted `response.json`:

```json
{
  "GET": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": { ... }
  }
}
```

### Merging Behavior

When `response.json` already exists in the target folder:

| `overwrite` | Existing method block exists?       | Action                          |
|-------------|-------------------------------------|---------------------------------|
| `false`     | yes                                 | Skip (preserve existing)        |
| `false`     | no                                  | Add new method block            |
| `true`      | yes                                 | Replace method block            |
| `true`      | no                                  | Add new method block            |

### Body Handling

- Successful JSON responses are pretty-printed.
- Non-JSON bodies (HTML, binary) are skipped with a logged warning. (Phase 1
  records JSON only; binary support is out of scope.)

### Logging

Each recording action emits a single log line:

```
[recorder] saved   GET    /users         → endpoints/users/response.json
[recorder] skipped GET    /health        (exclude rule)
[recorder] kept    GET    /posts/1       (overwrite=false)
```

## Interaction with Other Features

- **CORS / global headers** are applied **only** to mocked responses, not
  to proxied ones (the upstream's headers are authoritative).
- **OpenAPI checker** (Phase 3) reads the recorded stubs the same way it
  reads hand-written ones.

## References

- D-015, D-016, D-017, D-019
- [`09-configuration.md`](09-configuration.md), [`02-conventions.md`](02-conventions.md)
