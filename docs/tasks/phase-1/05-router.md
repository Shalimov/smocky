# Task T-1.05: Router

## Status
- [x] Complete (2026-04-22)

## Goal
Walk `endpointsDir` at startup, build a route table, and provide a
matching function that returns the matched route + extracted params for a
given `(method, path)`.

## Context
The router is purely structural — no I/O during a request. It applies the
"static beats dynamic" specificity rule (D-003) and supports `_param`
dynamic segments (D-001).

## Inputs / Prerequisites
- T-1.02 complete.
- Read: [`architecture/02-conventions.md`](../../architecture/02-conventions.md),
  [`architecture/07-routing.md`](../../architecture/07-routing.md).
- Decisions: D-001, D-002, D-003, D-004.

## Deliverables
- `src/router.ts`

## Implementation Notes

### Types
```ts
export interface Route {
  pattern: string[];
  paramNames: string[];
  methods: Set<string>;
  responseFile: string;
  hookFile: string | null;
  specificity: number;
}

export interface MatchResult {
  route: Route;
  params: Record<string, string>;
}

export interface Router {
  match(method: string, path: string): MatchResult | null;
  routes(): Route[];                  // for diagnostics
}

export async function buildRouter(endpointsDir: string): Promise<Router>;
```

### Discovery Walk
Recursively walk `endpointsDir`. For each folder containing `response.json`:

```ts
const segments = relative(endpointsDir, folder).split(sep);
const paramNames = segments
  .filter(s => s.startsWith('_'))
  .map(s => s.slice(1));
const responseFile = join(folder, 'response.json');
const hookFile = await exists(join(folder, 'hook.ts')) ? join(folder, 'hook.ts') : null;
const methods = new Set(Object.keys(require(responseFile)).map(m => m.toUpperCase()));
const specificity = computeSpecificity(segments);
```

### Specificity
```ts
function computeSpecificity(segs: string[]): number {
  let n = 0;
  for (const s of segs) n = (n << 1) | (s.startsWith('_') ? 0 : 1);
  return n;
}
```

### Matching
1. Normalize path: strip leading/trailing slashes, split on `/`.
2. Filter routes by segment count.
3. For each candidate, compare segment-by-segment:
   - Static segment must equal request segment.
   - Dynamic segment matches anything; capture into `params`.
4. From survivors, sort descending by `specificity`, pick the head.
5. Verify the route supports the request method (uppercased).
6. Return `{ route, params }` or `null`.

### Edge Cases
- `/` → segments `[]` → matches root-level `endpoints/response.json`.
- Trailing slash normalized away.
- Multi-method routes: matching path is enough; method check is
  separate so the responder can return 405 if path matches but method
  doesn't (optional v1 — for v1 just return null and let proxy handle).

### OPTIONS / CORS Preflight
The router does not handle `OPTIONS` specially; the server bootstrap
(T-1.10) intercepts `OPTIONS` requests and returns 204 with
`globalHeaders`.

## Acceptance Criteria
- [ ] `/users` matches `endpoints/users/`.
- [ ] `/users/42` matches `endpoints/users/_id/` with `params.id = '42'`.
- [ ] `/users/me` matches `endpoints/users/me/` even when `_id` exists.
- [ ] Unknown path returns `null`.
- [ ] Router built from a fixture directory at unit-test time.

## Out of Scope
- Loading and rendering responses (T-1.07).
- Method 405 handling (deferred).

## References
- D-001, D-002, D-003, D-004
- [`architecture/07-routing.md`](../../architecture/07-routing.md)
