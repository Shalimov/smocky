# 13 — Out of Scope

This document records features that have been **explicitly excluded**, with
the reasoning. The point isn't to forbid them forever — it's to keep the
scope honest and provide rationale when revisiting later.

## Hot Reload / File Watching (D-032)

**Excluded.** Bun restarts in milliseconds; the complexity of correctly
invalidating helper module caches and re-parsing the route table outweighs
the benefit. Manual restart is acceptable for a dev tool.

*Future revisit trigger:* Restart latency becomes painful for large
projects, or users repeatedly request it.

## Stateful Scenarios (WireMock-style)

**Excluded.** Multi-step state machines (`Created → Updated → Deleted`)
add significant complexity in routing, configuration, and debugging. The
Phase 2 in-memory DB covers the most common stateful use case (CRUD).

*Future revisit trigger:* Demonstrated need for time-travel/state
sequencing that DB mutations can't express.

## Advanced Request Matching

**Excluded.** Matching responses by query params, headers, or request body
content (beyond path + method) was deferred. It overlaps with hooks: a hook
can inspect any of these and mutate the response accordingly.

*Future revisit trigger:* Concrete pattern emerges where a `_match.json`
file is genuinely simpler than a hook.

## Admin / Inspection HTTP Endpoint

**Excluded.** A `GET /__smocker` endpoint listing all registered stubs is
nice-to-have but not essential. Logs at startup already enumerate routes.

*Future revisit trigger:* Recorder use grows and users want runtime
visibility.

## Multiple Conditional Responses Per Method

**Excluded.** The decision was that one response per method, plus hooks,
covers the realistic frontend dev needs without inventing a matcher DSL.

*Future revisit trigger:* See "Advanced Request Matching" above.

## Live Proxy Validation Against OpenAPI (D-026)

**Excluded.** Validating every proxied response against the spec at
runtime adds latency and noisy logs. The CLI checker (`smocker check api`)
covers the same need on demand or in CI.

*Future revisit trigger:* Users want continuous monitoring during dev.

## Non-Text Report Formats (D-030)

**Excluded for v1.** HTML, JSON, and JUnit XML report formats for the
checker are deferred. Text in the terminal is sufficient for both human
review and basic CI grep checks.

*Future revisit trigger:* CI integrations require structured output.

## Auto-CRUD Generation From DB (Phase 2)

**Open question — pending decision.** Auto-generating REST handlers from
DB collections is powerful but magical. Tracked in
[`tasks/phase-2/06-auto-crud-decision.md`](../tasks/phase-2/06-auto-crud-decision.md).

## Binary Body Recording (D-017)

**Excluded.** The recorder writes JSON only; binary upstream responses
are skipped with a warning. Adding binary stub support requires deciding
on storage format (separate file? base64?).

*Future revisit trigger:* Need to mock asset endpoints (PDFs, images).

## Multi-Process / Multi-Server DB Consistency (Phase 2)

**Excluded.** The in-memory DB is per-process. No cluster mode, no Redis
backend.

*Future revisit trigger:* Smocker is used to mock services in production
load tests. (Unlikely.)

## Schema Enforcement on DB Inserts (Phase 2)

**Excluded.** The DB stores anything. Schemas live in OpenAPI specs, not
inline.

*Future revisit trigger:* Users want type-safe collection definitions.

## References

- D-026, D-030, D-032
- [`11-database.md`](11-database.md), [`12-openapi-checker.md`](12-openapi-checker.md)
