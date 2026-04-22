# 12 — OpenAPI Checker (Phase 3)

> **Status:** Designed, deferred. Phase 1 reserves the `smocker check`
> CLI subcommand and the `openapi` config namespace so this phase ships
> non-breaking.

The OpenAPI checker is a **separate CLI command** (D-026 — never a runtime
middleware) that detects drift between three artifacts:

1. The OpenAPI 3.x specification (`openapi.json` / `.yaml`).
2. The real backend at `baseUrl`.
3. The local mocks under `endpoints/`.

## Modes (D-027)

| Command                  | Compares                                  |
|--------------------------|-------------------------------------------|
| `smocker check api`      | Spec ↔ real API                           |
| `smocker check mocks`    | Spec ↔ local mocks                        |
| `smocker check all`      | Both, in one report                       |

## What Mismatches Are Detected

### Spec ↔ Real API
- HTTP status mismatch
- Response body schema violations (missing required, type mismatch, format
  violations)
- Documented endpoints returning 404 / 5xx
- Undocumented endpoints (when recorder is on, separate task)

### Spec ↔ Mocks
- Mocks missing for documented endpoints
- Mocks for undocumented endpoints
- Mock response bodies failing the spec's response schema
- Mock status codes not present in the spec

## Module Layout

```
src/checker/
├── spec-loader.ts        # load + dereference $refs
├── validator.ts          # Ajv-based JSON Schema validation
├── sample-generator.ts   # synthesize request bodies from schema
├── api-checker.ts        # spec ↔ real api mode
├── mock-checker.ts       # spec ↔ mocks mode
└── reporter.ts           # text terminal output
```

## Dependencies (D-029)

Phase 3 introduces the project's first runtime npm dependencies:

| Package                                        | Purpose                       |
|------------------------------------------------|-------------------------------|
| `ajv`                                          | JSON Schema validation        |
| `ajv-formats`                                  | format keyword (`email`, …)   |
| `@apidevtools/json-schema-ref-parser`          | `$ref` dereferencing          |
| `json-schema-faker` *(or minimal homegrown)*   | request body synthesis        |

## Sample Generation (D-028)

For each `requestBody`:

1. If `openapi.check.sampleData` provides an entry for the operationId or
   `<METHOD> <path>`, use it verbatim.
2. Otherwise, synthesize from the request schema using `json-schema-faker`.
3. Skip the operation if neither produces a sendable body and `requestBody`
   is required.

```json
// openapi-samples.json (override)
{
  "POST /users": { "name": "Test", "email": "t@example.com" },
  "createUser":  { "name": "Test", "email": "t@example.com" }
}
```

## Configuration (D-026)

```ts
openapi: {
  spec: './openapi.json',
  check: {
    timeout: 5000,
    auth: { headers: { Authorization: 'Bearer xyz' } },
    skipPaths: ['/internal/*'],
    sampleData: './openapi-samples.json',
    failOnMismatch: false,
  },
},
```

## Output (D-030)

**Text-only** for v1. JSON / JUnit / HTML reports are explicitly out of
scope (see [`13-out-of-scope.md`](13-out-of-scope.md)).

```
✗ GET /users/{id}
  Real API: status 200 ✓
            body.email is "string" but spec requires format "email" ✗
            body.createdAt missing (required by spec) ✗
  Mock:     no mock found for documented endpoint ⚠

✓ POST /users
  Real API: matches spec
  Mock:     matches spec

3 endpoints checked · 1 mismatch · 1 warning
```

## Failure Behavior (D-031)

| Mode                         | Exit Code |
|------------------------------|-----------|
| Default (warn-only)          | 0         |
| `--fail` set, no mismatches  | 0         |
| `--fail` set, mismatches     | 3         |

Configurable via `openapi.check.failOnMismatch` or the `--fail` flag.

## CLI Surface

```
smocker check api    [--fail] [--config <path>]
smocker check mocks  [--fail] [--config <path>]
smocker check all    [--fail] [--config <path>]
```

## Spec Loading

- Supports JSON and YAML.
- Local paths and `http(s)://` URLs.
- All `$ref`s (internal and external) resolved up front via ref-parser.
- Cached in memory for the duration of the command.

## Operation Matching

- `paths` patterns (`/users/{id}`) are converted to a regex.
- Mocks are matched via Smocker's existing router (reuse of internal API).

## Skip Rules

`openapi.check.skipPaths` accepts strings (prefix match) and RegExps.
Useful for excluding internal/healthcheck endpoints.

## Forward-Compat From Phase 1

Phase 1 ships:

- `smocker check` CLI subcommand stub printing a "not yet implemented"
  notice (D-033).
- `openapi` field accepted but ignored in `mock.config.ts`.
- Router internals exported (or re-exportable) to enable later reuse by
  `mock-checker.ts`.

## References

- D-026, D-027, D-028, D-029, D-030, D-031, D-033
- [`07-routing.md`](07-routing.md), [`13-out-of-scope.md`](13-out-of-scope.md)
