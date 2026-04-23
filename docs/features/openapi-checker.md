# OpenAPI Checker

`smocky check` is a separate CLI command that detects drift between three
artifacts:

1. Your OpenAPI 3.x specification.
2. The real backend at `baseUrl`.
3. The local mocks under `endpoints/`.

It is **never** middleware in the running server — it's an offline tool you
run on demand or in CI.

## Modes

| Command                  | Compares                      |
|--------------------------|-------------------------------|
| `smocky check api`      | Spec ↔ real API               |
| `smocky check mocks`    | Spec ↔ local mocks            |
| `smocky check all`      | Both, in one report           |

## Configuration

```ts
// smocky.config.ts
import { defineConfig } from 'smocky';

export default defineConfig({
  baseUrl: 'http://127.0.0.1:3000',
  openapi: {
    spec: './openapi.json',
    check: {
      timeout: 5000,
      auth: { headers: { Authorization: 'Bearer xyz' } },
      skipPaths: ['/internal/', /^\/health/],
      sampleData: './openapi-samples.json',
      failOnMismatch: false,
    },
  },
});
```

| Field                 | Default | Notes                                          |
|-----------------------|---------|------------------------------------------------|
| `spec`                | —       | Path or URL to `openapi.json` / `.yaml`        |
| `check.timeout`       | `5000`  | Request timeout for `check api` (ms)           |
| `check.auth.headers`  | —       | Headers attached to every API check request    |
| `check.skipPaths`     | `[]`    | Strings (prefix) or RegExps (full path)        |
| `check.sampleData`    | —       | Override file for synthesized request bodies   |
| `check.failOnMismatch`| `false` | If true, exits with code `3` on any mismatch   |

## Spec Loading

- JSON and YAML supported.
- Local paths and `http(s)://` URLs supported.
- All `$ref`s (internal and external) are resolved up front.
- The result is cached in memory for the duration of the command.

## CLI

```
smocky check api    [--fail] [--config <path>] [--base-url <url>]
smocky check mocks  [--fail] [--config <path>]
smocky check all    [--fail] [--config <path>] [--base-url <url>]
```

`--base-url` overrides `smocky.config.ts -> baseUrl` for `check api` and
`check all` — handy for pointing the checker at a staging environment or
back at Smocky itself without editing config.

`--fail` is equivalent to `openapi.check.failOnMismatch = true`.

### Exit Codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | Success (no mismatches, or `--fail` not set)     |
| 1    | Configuration error (e.g. missing `openapi.spec`)|
| 3    | Mismatches found and `--fail` is set             |

## What It Detects

### Spec ↔ Real API

- HTTP status mismatches.
- Response body schema violations (missing required fields, type
  mismatches, format violations like `email`, `date-time`, etc.).
- Documented endpoints returning `404` / `5xx`.

### Spec ↔ Mocks

- Mocks missing for documented endpoints.
- Mocks present for undocumented endpoints.
- Mock response bodies failing the spec's response schema.
- Mock status codes not present in the spec.

For mocks, the checker validates the **fully resolved response** — after
templating and hook execution — so anything a real client would see is
what gets checked.

## Sample Data

For each `requestBody` in the spec, the checker builds a payload by:

1. Looking up an override in `openapi.check.sampleData`, keyed by either
   the operation's `operationId` or `<METHOD> <path>`.
2. Otherwise, synthesizing a body from the request schema with
   `json-schema-faker`.
3. Skipping the operation if neither produces a sendable body and
   `requestBody` is required.

Override file format:

```json
{
  "POST /users": { "name": "Test", "email": "t@example.com" },
  "createUser":  { "name": "Test", "email": "t@example.com" }
}
```

## Skip Rules

`openapi.check.skipPaths` accepts strings (prefix match) or RegExps (full
path match). Useful for excluding internal/healthcheck endpoints from the
report.

```ts
skipPaths: ['/internal/', /^\/health/]
```

## Output

Output is plain text. Example:

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

JSON / JUnit / HTML reports are not supported.

## Recipes

### Check mocks before committing

```bash
bun smocky check mocks --fail
```

### Compare staging to spec in CI

```bash
bun smocky check api --base-url https://staging.example.com --fail
```

### Smoke-check the running mock server against itself

```bash
# terminal 1
bun smocky serve --base-url ""

# terminal 2
bun smocky check api --base-url http://127.0.0.1:3000
```

> If you're working from a checkout, swap `bun smocky` for
> `bun run src/cli/index.ts`.

## Dependencies

The checker is the only feature that pulls in runtime npm dependencies:

| Package                                | Purpose                       |
|----------------------------------------|-------------------------------|
| `ajv`                                  | JSON Schema validation        |
| `ajv-formats`                          | format keyword (`email`, …)   |
| `@apidevtools/json-schema-ref-parser`  | `$ref` dereferencing          |
| `json-schema-faker`                    | request body synthesis        |
