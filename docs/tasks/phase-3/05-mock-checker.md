# Task T-3.05: Mock Checker

## Status
- [ ] Not started

## Goal
For every spec operation, find the corresponding mock in `endpoints/` and
validate the mock's response body against the spec's response schema.
Also detect mocks for undocumented operations.

## Context
Implements the `smocker check mocks` mode (D-027). Reuses the existing
Phase 1 router for path matching.

## Inputs / Prerequisites
- T-3.01, T-3.02 complete; Phase 1 router available.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md),
  [`architecture/07-routing.md`](../../architecture/07-routing.md).
- Decisions: D-027.

## Deliverables
- `src/checker/mock-checker.ts`

## Implementation Notes

### Bidirectional Sweep
```ts
// 1. spec → mocks
for each op in spec:
  match = router.match(method, openapiPathToSmocker(path));
  if (!match)              report.add('mock-missing');
  else {
    block = response.json[method];
    if (!block)            report.add('method-missing');
    else {
      schema = op.responses[String(block.status)]?.content?...?.schema;
      if (schema) {
        // Render templates with a stub ctx (no req.* required fields)
        const rendered = await engine.render(block.body, { req: stubReq() });
        const issues = validate(schema, rendered);
        if (issues.length) report.add('schema-mismatch');
      }
    }
  }

// 2. mocks → spec
for each route in router.routes():
  for each method in route.methods:
    if not specHas(method, route)  report.add('undocumented-mock');
```

### Path Translation
OpenAPI uses `/users/{id}`. Smocker uses `_id`. Convert both directions
when matching.

### Stub Request for Templates
Provide a minimal `req` so templates that read `req.params.id`, etc.,
don't crash. Use synthesized values from the spec's path parameters.

## Acceptance Criteria
- [ ] Identifies missing mocks for documented ops.
- [ ] Identifies mocks not in the spec.
- [ ] Validates rendered mock bodies.
- [ ] Skip rules respected.
- [ ] Output is a structured report.

## Out of Scope
- Sending real requests (T-3.04).

## References
- D-027
- [`architecture/07-routing.md`](../../architecture/07-routing.md),
  [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
