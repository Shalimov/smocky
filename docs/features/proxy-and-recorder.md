# Proxy and Recorder

When no mock matches an incoming request, Smocky falls through to the
**proxy**, forwarding the call to the upstream API at `baseUrl`. With the
**recorder** enabled, the upstream response is also persisted as a local
mock so the next call can be served offline.

## When the Proxy Runs

Set `baseUrl` in `smocky.config.ts`:

```ts
import { defineConfig } from 'smocky';

export default defineConfig({
  baseUrl: 'https://jsonplaceholder.typicode.com',
});
```

Request flow:

1. Router checks `endpoints/` for a match.
2. If matched → mock is returned.
3. If not matched and `baseUrl` is set → request is proxied.
4. If not matched and `baseUrl` is empty → `404`.

## Forwarding Rules

| Aspect          | Behavior                                              |
|-----------------|-------------------------------------------------------|
| URL             | `baseUrl + req.path + req.search`                     |
| Method          | Forwarded unchanged                                   |
| Headers         | Forwarded; hop-by-hop headers stripped                |
| `Host` header   | Replaced with the upstream host                       |
| Body            | Streamed when possible                                |
| Status          | Returned unchanged                                    |
| Response headers| Returned unchanged (no `globalHeaders` merge)         |
| Response body   | Streamed back to the client                           |

The following hop-by-hop headers (RFC 7230 §6.1) are stripped:

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

## Errors

| Condition          | Response                                              |
|--------------------|-------------------------------------------------------|
| Network failure    | `502` with `{ error: 'ProxyError', message }`         |
| Timeout            | `504` with `{ error: 'ProxyTimeout' }`                |
| Invalid `baseUrl`  | Logged at startup; requests get `502`                 |

## Recorder

The recorder writes each successfully proxied response to disk as a
`response.json` file under `endpointsDir`, ready to serve as a mock on the
next run.

### Enabling

Three ways, in priority order:

```bash
bun smocky serve --record
```

```bash
RECORD=1 bun smocky serve
```

```ts
// smocky.config.ts
record: {
  enabled: true,
}
```

> If you're hacking on smocky from a checkout, replace `bun smocky`
> with `bun run src/cli/index.ts` in any of these commands.

### Configuration

```ts
record: {
  enabled: false,                       // master switch
  outputDir: './endpoints',             // defaults to endpointsDir
  include: ['/api/'],                   // allow-list (string prefix or RegExp)
  exclude: ['/health', /^\/internal\//],// deny-list, checked first
  overwrite: false,                     // replace existing method blocks?
}
```

### Filter Precedence

1. **Exclude** is checked first. Match → skip.
2. If `include` is non-empty, the path must match. Otherwise → skip.
3. Otherwise → record.

Strings match by prefix (`/api/` matches `/api/users`).
RegExps match the full path.

### Path → Folder Conversion

```
/users           → endpoints/users/response.json
/users/123       → endpoints/users/123/response.json
/users/123/posts → endpoints/users/123/posts/response.json
```

> Numeric IDs become **literal folders**, not `_id`. After recording,
> manually rename folders like `123/` to `_id/` to convert them into
> dynamic routes. Auto-detection of dynamic segments is intentionally not
> done.

### File Format

```json
{
  "GET": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": { "id": 1, "name": "Alice" }
  }
}
```

### Merging Behavior

When a `response.json` already exists in the target folder:

| `overwrite` | Existing method block? | Action                    |
|-------------|------------------------|---------------------------|
| `false`     | yes                    | Skip (preserve existing)  |
| `false`     | no                     | Add new method block      |
| `true`      | yes                    | Replace method block      |
| `true`      | no                     | Add new method block      |

### Body Handling

- JSON responses are pretty-printed.
- Non-JSON bodies (HTML, binary) are skipped with a logged warning.

### Logs

Each recording action emits a single log line:

```
[recorder] saved   GET    /users         → endpoints/users/response.json
[recorder] skipped GET    /health        (exclude rule)
[recorder] kept    GET    /posts/1       (overwrite=false)
```

## Recipes

### Record once, then go offline

```bash
RECORD=1 bun smocky serve
# exercise the app...
# stop the server, then run again without RECORD
bun smocky serve
```

### Capture only a subset of an API

```ts
record: {
  enabled: true,
  include: ['/api/v1/'],
  exclude: ['/api/v1/healthz'],
}
```

### Refresh a single endpoint

Delete the relevant `response.json` (or set `overwrite: true` and re-hit the
endpoint) and restart with recording on.

## Notes

- `globalHeaders` (e.g. CORS) are applied **only** to mocked responses, not
  to proxied ones — the upstream's headers are authoritative.
- The OpenAPI checker reads recorded stubs the same way it reads
  hand-written ones; see [OpenAPI Checker](openapi-checker.md).
