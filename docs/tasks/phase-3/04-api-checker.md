# Task T-3.04: API Checker

## Status
- [x] Complete (2026-04-22)

## Goal
Iterate every operation in the spec, send a request to the real backend,
and validate the response against the spec's response schema.

## Context
Implements the `smocker check api` mode (D-027).

## Inputs / Prerequisites
- T-3.01, T-3.02, T-3.03 complete.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-026, D-027.

## Deliverables
- `src/checker/api-checker.ts`

## Implementation Notes

### Per-Operation Flow
```ts
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (skipPaths.matches(path)) continue;

    const url = buildUrl(baseUrl, path, op);
    const body = generateBody(op.requestBody?.content?.['application/json']?.schema);
    const headers = { ...auth.headers, 'content-type': 'application/json' };

    const t0 = performance.now();
    const res = await fetch(url, { method: method.toUpperCase(), headers, body: body && JSON.stringify(body), signal: ctrl.signal });
    const elapsed = performance.now() - t0;

    const expected = op.responses[String(res.status)] ?? op.responses['default'];
    if (!expected) {
      report.add(method, path, { kind: 'unexpected-status', got: res.status });
      continue;
    }
    const schema = expected.content?.['application/json']?.schema;
    if (!schema) continue;
    const json = await res.json();
    const issues = validate(schema, json);
    report.add(method, path, { kind: issues.length ? 'schema-mismatch' : 'ok', issues, elapsed });
  }
}
```

### Authentication
Headers from `openapi.check.auth.headers` are merged into every request.

### Timeouts & Errors
Each request has its own AbortController (timeout from
`openapi.check.timeout`). Network errors become `transport-error` entries.

## Acceptance Criteria
- [ ] Every spec operation is attempted (or recorded as skipped).
- [ ] Validation issues collected with op metadata.
- [ ] Auth headers applied.
- [ ] Skip paths respected.
- [ ] Output is a structured report passed to T-3.06.

## Out of Scope
- Mock checking (T-3.05).
- Output rendering (T-3.06).

## References
- D-026, D-027
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
