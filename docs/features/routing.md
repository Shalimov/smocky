# Routing

The router maps an incoming `(method, path)` pair to a route entry built
from the `endpoints/` directory.

## Discovery (Startup)

1. Walk `endpointsDir` recursively.
2. For each folder containing `response.json`:
   - Convert folder path → URL path template (preserving `_param` segments).
   - Parse `response.json`; collect supported HTTP methods.
   - Note presence of `hook.ts` (or `hook.js`).
3. Build a route table sorted by specificity.

## Path Conversion

| Folder                          | URL template          | Params      |
|---------------------------------|-----------------------|-------------|
| `endpoints/users/`              | `/users`              | `[]`        |
| `endpoints/users/_id/`          | `/users/:id`          | `['id']`    |
| `endpoints/orgs/_org/users/`    | `/orgs/:org/users`    | `['org']`   |

## Matching Algorithm

For request `/users/42`:

1. Split into segments: `['users', '42']`.
2. Filter routes to those with the same segment count.
3. For each candidate, walk segments left to right:
   - Static segment: must equal exactly.
   - `_param` segment: matches anything; capture the value.
4. From surviving candidates, pick the one with the **highest specificity**.

## Specificity

Each segment contributes one bit (MSB on the left):

- Static segment → `1`
- Dynamic segment → `0`

For two-segment routes:

| Route          | Bits | Specificity |
|----------------|------|-------------|
| `users/me`     | `11` | 3           |
| `users/_id`    | `10` | 2           |

`/users/me` matches both; specificity picks `users/me`.
`/users/42` matches only the second.

## Method Matching

- Method names are normalized to uppercase.
- `OPTIONS` requests are handled specially: a 204 response with the
  configured `globalHeaders` is returned automatically (CORS preflight).
  You do not need to define `OPTIONS` per endpoint.
- If the path matches but the method block is missing, the response is
  `405 Method Not Allowed` with an `Allow` header listing supported methods.

## Misses

If no route matches, the request falls through to the
[proxy](proxy-and-recorder.md). With no `baseUrl` configured, a 404 is
returned.

## Param Extraction

When a match wins, params are exposed as `req.params`:

```ts
// GET /users/42 against endpoints/users/_id/
req.params // { id: '42' }
```

## Trailing Slashes & Edge Cases

- `/users/` is normalized to `/users` before matching.
- `/` matches `endpoints/response.json` (a root-level mock), if present.
- Segments are case-sensitive; methods are case-insensitive.
