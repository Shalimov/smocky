# 01 — Overview

## What Is Smocker?

Smocker is a **Bun-powered mock HTTP server** designed for frontend
development. It mocks only what you explicitly define, transparently proxies
everything else to a real backend, and provides ergonomic primitives for
generating dynamic responses.

> Mock surgically. Proxy everything else. Validate against the real spec.

## Problems It Solves

| Problem                                                             | Smocker's Answer                                       |
|---------------------------------------------------------------------|--------------------------------------------------------|
| Backend is unreliable / slow / unavailable during frontend dev      | Mock individual endpoints, proxy the rest              |
| Hand-written mock servers grow into untestable middleware soup      | Filesystem-driven conventions, no glue code            |
| Mocked data is too static (always returns same id, date, etc.)      | Liquid-lite templates + custom helpers                 |
| Need realistic CRUD behavior for prototyping                        | Phase 2: in-memory DB with simple query API            |
| Mocks drift from the real API contract                              | Phase 3: OpenAPI checker (`smocker check`)             |
| Bootstrapping mocks from a real API is tedious                      | Record mode auto-saves proxied responses               |

## Core Principles

1. **Convention over configuration.** A folder structure replaces routing
   config. Filenames carry meaning.
2. **Surgical mocking.** Mock the endpoint you care about today; everything
   else falls through to the real backend.
3. **Zero runtime dependencies in Phase 1.** Bun stdlib only. Phase 3 adds a
   small, justified set (Ajv, ref-parser).
4. **Forward compatibility.** Phase 1 reserves `ctx`, the `db.*` namespace,
   and the `check` subcommand so Phases 2 and 3 are non-breaking additions.
5. **Explicit over magical.** Behavior is predictable; no auto-CRUD until
   explicitly enabled (deferred decision).

## Target User

A frontend developer running `bun run dev` against a real backend they don't
fully control. They want fast, predictable, customizable responses for the
two or three endpoints currently being worked on.

## Three-Phase Roadmap

### Phase 1 — Mock Server Core
Filesystem routing, `response.json` per endpoint, templating with helpers,
hooks for response mutation, transparent proxy fallback, optional record
mode, configurable global headers.

### Phase 2 — Shared In-Memory DB
Collection-based store seeded from `db/<collection>.json`. Hooks read/write;
templates have read-only access. UUID-based ids. Persistence opt-in.
Auto-CRUD generation pending future decision.

### Phase 3 — OpenAPI Contract Checker
`smocker check` CLI command. Three modes: spec ↔ real API, spec ↔ mocks,
both. Auto-synthesized request bodies with manual override. Text-only
reports. Configurable warn-vs-fail behavior for CI.

## Distribution

Smocker is **both**:

- A **CLI** runnable via `bun run smocker serve` or `bun run smocker check`.
- A **library** importable as `import { startServer } from 'smocker'` for
  programmatic embedding.

## Non-Goals

See [`13-out-of-scope.md`](13-out-of-scope.md) for the explicit exclusion
list with rationale.

## References

- [`02-conventions.md`](02-conventions.md) — folder layout
- [`03-request-lifecycle.md`](03-request-lifecycle.md) — request flow
- [`../decisions/decision-log.md`](../decisions/decision-log.md) — D-001…D-034
