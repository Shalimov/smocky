# Task T-3.08: Config Extension

## Status
- [ ] Not started

## Goal
Activate the `openapi` config field reserved in Phase 1 — moving it from
"accepted but unused" to a fully validated, documented configuration
section.

## Context
Phase 1 reserves the namespace (D-026 forward-compat). Phase 3 promotes it
to a real, validated field.

## Inputs / Prerequisites
- T-3.07 complete.
- Read: [`architecture/09-configuration.md`](../../architecture/09-configuration.md),
  [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-026, D-031.

## Deliverables
- Updates to `src/config.ts` (validation for `openapi.*`).
- Updates to `src/types.ts` (tighten `OpenApiConfig` types).

## Implementation Notes

### Validation
```ts
function validateOpenApi(o?: OpenApiConfig) {
  if (!o) return;
  if (!o.spec) throw new ConfigError('openapi.spec is required when openapi is set');
  if (o.check?.timeout != null && o.check.timeout <= 0) {
    throw new ConfigError('openapi.check.timeout must be > 0');
  }
  // skipPaths can be string or RegExp arrays — ensure types
}
```

### Defaults
```ts
openapi.check.timeout         ?? 5000
openapi.check.failOnMismatch  ?? false
openapi.check.skipPaths       ?? []
```

## Acceptance Criteria
- [ ] Bad `openapi` config rejected at startup with clear message.
- [ ] Defaults applied when fields are omitted.
- [ ] Phase 1 stub warning removed.

## Out of Scope
- Adding new openapi config fields.

## References
- D-026, D-031
- [`architecture/09-configuration.md`](../../architecture/09-configuration.md)
