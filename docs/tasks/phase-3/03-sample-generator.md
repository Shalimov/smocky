# Task T-3.03: Sample Generator

## Status
- [ ] Not started

## Goal
Synthesize request bodies (and path/query params when needed) from
OpenAPI operation schemas, with optional manual overrides via
`openapi.check.sampleData`.

## Context
The API checker needs valid request bodies to send to the real backend.
Auto-generation makes "zero-config" checking possible (D-028).

## Inputs / Prerequisites
- T-3.01, T-3.02 complete.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-028.

## Deliverables
- `src/checker/sample-generator.ts`
- Add `json-schema-faker` (or document a minimal homegrown generator).

## Implementation Notes

### Override Lookup
Override file shape:
```json
{
  "POST /users":     { ... },
  "createUser":      { ... }
}
```

Lookup precedence:
1. By `operationId`.
2. By `<METHOD> <path>` (literal OpenAPI path with `{...}`).

### Auto-Generation
```ts
import jsf from 'json-schema-faker';

jsf.option({ alwaysFakeOptionals: true, useDefaultValue: true });

export function generateBody(schema: object): unknown {
  return jsf.generate(schema);
}
```

### Path/Query Synthesis
For `path` parameters, generate a value from the parameter schema.
Useful for `GET /users/{id}` — picks a sample id (UUID for uuid, integer
for integer, etc.).

### Skipping
If no override and synthesis fails (e.g. missing schema), the operation
is reported as **skipped** with reason `no sample data available`.

## Acceptance Criteria
- [ ] Override file consulted before synthesis.
- [ ] Synthesized bodies validate against the request schema.
- [ ] Path/query samples generated for typed params.
- [ ] Operations without enough info are skipped, not failed.

## Out of Scope
- Sending requests (T-3.04).

## References
- D-028
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
