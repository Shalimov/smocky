# Task T-3.09: Docs & Examples

## Status
- [x] Complete (2026-04-22)

## Goal
Update the README and supply a minimal `openapi.json` + `openapi-samples.json`
in the example scaffold so users can try the checker immediately.

## Context
Closes Phase 3.

## Inputs / Prerequisites
- T-3.07, T-3.08 complete.
- Read: T-1.13.

## Deliverables
- `examples/openapi.json` (or repo root) — minimal spec covering the
  example endpoints.
- `examples/openapi-samples.json` — manual overrides for POST bodies.
- README "OpenAPI Checker" section linking to
  `docs/architecture/12-openapi-checker.md`.

## Implementation Notes

### Sample Spec Coverage
- `GET /users` → array schema
- `GET /users/{id}` → object with `id`, `name`, `luckyNumber`
- `POST /users` → request body schema, response schema
- `DELETE /users/{id}` → 204

### README Section Outline
- What the checker does
- 30-second quick start
  ```
  smocker check mocks
  smocker check api
  smocker check all --fail
  ```
- How to provide overrides
- How to skip endpoints
- Note: text output only; structured formats out of scope (link to
  `docs/architecture/13-out-of-scope.md`).

## Acceptance Criteria
- [x] `smocker check mocks` runs against the example spec and produces a
      report.
- [x] `smocker check api` runs against a configured `baseUrl` and
      produces a report.
- [x] README section is self-contained.

## Out of Scope
- Generating richer example specs.

## References
- D-026, D-027, D-028, D-030, D-031
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
