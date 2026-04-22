# Task T-3.02: Validator

## Status
- [x] Complete (2026-04-22)

## Goal
Wrap Ajv to validate response payloads against an OpenAPI response schema
and produce a structured list of mismatches.

## Context
The validator is the heart of both checker modes. It must support OpenAPI
3.x schema dialect plus standard formats (`email`, `uuid`, `date-time`).

## Inputs / Prerequisites
- T-3.01 complete.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-029.

## Deliverables
- `src/checker/validator.ts`
- Add `ajv` and `ajv-formats` to `package.json` dependencies.

## Implementation Notes

```ts
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export interface Mismatch {
  path: string;          // JSON pointer into the body
  message: string;       // human-readable
  keyword: string;       // ajv keyword
}

export function validate(schema: object, value: unknown): Mismatch[] {
  const fn = ajv.compile(schema);
  if (fn(value)) return [];
  return (fn.errors ?? []).map(toMismatch);
}

function toMismatch(e: ErrorObject): Mismatch {
  return {
    path: e.instancePath || '/',
    message: `${e.instancePath || '<root>'} ${e.message}`,
    keyword: e.keyword,
  };
}
```

### Schema Caching
Compile each schema once per spec load; key by reference identity.

## Acceptance Criteria
- [ ] Returns empty array for valid payloads.
- [ ] Returns a `Mismatch[]` with usable `path` + `message` for invalid.
- [ ] Format keywords (`email`, `uuid`, `date-time`) enforced.
- [ ] Compilation cached.

## Out of Scope
- Operation matching (T-3.04, T-3.05).
- Reporting (T-3.06).

## References
- D-029
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
