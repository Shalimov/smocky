# Task T-3.01: Spec Loader

## Status
- [x] Complete (2026-04-22)

## Goal
Load an OpenAPI 3.x specification (JSON or YAML, file or URL) and fully
dereference all `$ref` pointers so downstream modules can treat schemas as
self-contained.

## Context
First Phase 3 task. The loader is reused by both the API and mock
checkers.

## Inputs / Prerequisites
- All of Phase 1.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-029.

## Deliverables
- `src/checker/spec-loader.ts`
- Add `@apidevtools/json-schema-ref-parser` to `package.json` dependencies
  (Phase 3's first runtime dep — see D-029).

## Implementation Notes

```ts
import $RefParser from '@apidevtools/json-schema-ref-parser';

export interface OpenApiSpec {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  // (additional properties — kept loose to avoid coupling)
  [key: string]: any;
}

export async function loadSpec(specPath: string): Promise<OpenApiSpec> {
  // ref-parser handles both local paths and http(s) URLs
  const dereffed = await $RefParser.dereference(specPath);
  return dereffed as OpenApiSpec;
}
```

YAML support: ref-parser handles YAML transparently if `js-yaml` is
installed (it ships as a transitive dep). Confirm.

## Acceptance Criteria
- [ ] Loads `openapi.json` and `openapi.yaml` from disk.
- [ ] Loads from `http(s)://` URL.
- [ ] All `$ref`s (internal and external) are resolved.
- [ ] Throws clearly on invalid file / unreachable URL.

## Out of Scope
- Validation (T-3.02).

## References
- D-029
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
