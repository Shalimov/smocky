# Task T-3.06: Reporter

## Status
- [ ] Not started

## Goal
Render the structured report from the API and mock checkers into
human-readable terminal text.

## Context
Text-only output for v1 (D-030). Designed for both human review and
basic CI grep checks.

## Inputs / Prerequisites
- T-3.04, T-3.05 complete.
- Read: [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-030.

## Deliverables
- `src/checker/reporter.ts`

## Implementation Notes

### Report Shape
```ts
export interface OpReport {
  method: string;
  path: string;
  api?: { status: 'ok' | 'mismatch' | 'error' | 'skipped'; issues: Mismatch[]; note?: string };
  mock?: { status: 'ok' | 'mismatch' | 'missing' | 'undocumented'; issues: Mismatch[] };
}

export interface Report {
  ops: OpReport[];
  totals: { checked: number; mismatches: number; warnings: number };
}
```

### Output Format
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

### Symbols
- `✓` ok
- `✗` mismatch
- `⚠` warning (missing mock, undocumented mock)
- `…` skipped

### Color
Use ANSI escapes when stdout is a TTY (`process.stdout.isTTY`).

## Acceptance Criteria
- [ ] Renders both API and mock results in the format above.
- [ ] Tallies displayed at the bottom.
- [ ] Plain text (no color) when piped.
- [ ] Returns counts so caller can decide exit code.

## Out of Scope
- JSON / JUnit / HTML formats (D-030 / out-of-scope doc).

## References
- D-030
- [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md)
