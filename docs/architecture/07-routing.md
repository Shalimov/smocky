# 07 — Routing

The router maps an incoming `(method, path)` pair to a route entry built
from the `endpoints/` directory.

## Discovery (Startup)

1. Walk `endpointsDir` recursively.
2. For each folder containing `response.json`:
   - Convert folder path → URL path template (preserving `_param` segments).
   - Parse `response.json`; collect supported HTTP methods.
   - Note presence of `hook.ts`.
3. Build a route table keyed by path-template.

```ts
interface Route {
  pattern: string[];                // ['users', '_id']
  paramNames: string[];             // ['id']
  methods: Set<string>;             // {'GET', 'POST'}
  responseFile: string;             // absolute path
  hookFile: string | null;          // absolute path or null
  isStatic: boolean;                // no _param segments?
  specificity: number;              // computed
}
```

## Path Conversion

Folder structure → segment array:

| Folder                        | Pattern               | Params      |
|-------------------------------|-----------------------|-------------|
| `endpoints/users/`            | `['users']`           | `[]`        |
| `endpoints/users/_id/`        | `['users', '_id']`    | `['id']`    |
| `endpoints/orgs/_org/users/`  | `['orgs','_org','users']` | `['org']` |

## Matching Algorithm

Given a request path `/users/42`:

1. Split into segments: `['users', '42']`.
2. Filter route table to entries with the same segment count.
3. For each candidate, walk segments left to right:
   - Static segment: must equal the route segment exactly.
   - `_param` segment: matches anything; capture the value.
4. From the surviving candidates, pick the one with the **highest
   specificity**.

## Specificity (D-003)

Specificity is computed as a binary number where each segment contributes
one bit, MSB on the left:

- Static segment → `1`
- Dynamic segment → `0`

For two-segment routes:

| Route                 | Bits | Specificity |
|-----------------------|------|-------------|
| `users/me`            | `11` | 3           |
| `users/_id`           | `10` | 2           |

`/users/me` matches both; specificity picks `users/me`. `/users/42` matches
only the second.

This generalizes to any depth: more static segments → higher specificity.

## Method Matching

Method names are normalized to uppercase. `OPTIONS` requests are handled
specially in Phase 1: a 204 with the configured global headers is returned
to support CORS preflight (no need to define `OPTIONS` per endpoint).

## Misses

If no route matches, the router returns `null`. The responder then routes
the request to the proxy (see [`08-proxy-and-recorder.md`](08-proxy-and-recorder.md)).

## Param Extraction

When a match wins, the router returns:

```ts
{
  route: Route,
  params: { id: '42' },
}
```

Params are exposed as `req.params` to templates and hooks.

## Trailing Slashes & Empty Paths

- `/users/` is normalized to `/users` before matching.
- `/` matches `endpoints/response.json` (a root-level mock), if present.

## Casing

- Path segments: case-sensitive (matches HTTP semantics).
- Methods: case-insensitive.

## Performance

The route table is computed once at startup. Matching is O(N×D) where N is
the number of routes and D is path depth — trivially small for typical
projects (hundreds of routes).

A future optimization is to bucket routes by segment count (already
implemented as a precondition above) and by first static segment.

## References

- D-001, D-003
- [`02-conventions.md`](02-conventions.md), [`03-request-lifecycle.md`](03-request-lifecycle.md)
