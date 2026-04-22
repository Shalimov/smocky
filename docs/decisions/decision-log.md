# Decision Log

This log records every locked design decision made for Smocker. Each entry
follows an ADR-lite format. Decisions are referenced throughout the
architecture docs and task files using their `D-NNN` identifier.

**Date format:** ISO 8601. **Status:** all entries are `Accepted` unless
otherwise noted. **Phase:** which phase the decision applies to.

---

## D-001: Dynamic URL segments use `_name`

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Context.** Filesystem-based routing needs a way to express dynamic URL
segments such as `:id` in `/users/:id`.

**Decision.** Folders prefixed with `_` (e.g. `_id`) are dynamic segments;
the name after the underscore is the parameter name.

**Consequences.** Easy to spot dynamic segments at a glance; underscore is
filesystem-safe everywhere. Slight learning curve.

**Alternatives.**
- `{id}` — visually clear but braces in folder names cause shell issues.
- `:id` — Express-style; colons are illegal on Windows.

---

## D-002: Single `response.json` per endpoint

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Context.** An endpoint may serve multiple HTTP methods.

**Decision.** One file (`response.json`) per endpoint folder, with HTTP
methods as top-level keys.

**Consequences.** Fewer files to manage; whole endpoint visible in one
diff. JSON validation tools work out of the box.

**Alternatives.** `GET.json`, `POST.json`, etc. — more files, more
visual noise.

---

## D-003: Static path segments win over dynamic

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Context.** When `/users/me` could match `users/me/` or `users/_id/`,
specificity must be defined.

**Decision.** Static segments contribute higher specificity than dynamic
ones, computed bit-wise per segment.

**Consequences.** Predictable matching; matches REST framework conventions
(Express, Hono, Fastify).

**Alternatives.** Definition order — fragile and surprising.

---

## D-004: Method-keyed response blocks

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Context.** Need a place to declare per-method status, headers, body.

**Decision.** Top-level keys in `response.json` are HTTP methods, each
mapping to a response object.

**Consequences.** Trivially extensible; matches D-002.

**Alternatives.** Separate files per method (rejected — see D-002).

---

## D-005: Response supports status, headers, body, and delay

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Context.** A mock response needs more than just a body to be useful.

**Decision.** Each method block accepts `status`, `headers`, `body`, and
`delay` (ms).

**Consequences.** Covers ~95% of frontend-dev needs (loading states, error
codes, custom headers).

**Alternatives.** Body-only — too limiting.

---

## D-006: Response defaults

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** When omitted: `status=200`, `headers={}`, `body={}`,
`delay=0`.

**Consequences.** Minimal-config friendly: `{ "GET": { "body": { ... } } }`
just works.

---

## D-007: Liquid-lite `{{ ... }}` template syntax

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Use `{{ expression }}` tokens inside JSON string values for
templating.

**Consequences.** Familiar to anyone who's used Handlebars/Liquid/Mustache;
JSON files remain valid JSON.

**Alternatives.** Proprietary `${...}`, custom prefix — less idiomatic.

---

## D-008: Templates have full request access

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Templates may access `req.params`, `req.query`,
`req.headers`, `req.body` via dotted paths.

**Consequences.** Many simple cases (echo id, reflect query) need no hook.

---

## D-009: Helpers accept string args, return any JSON value

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Helper functions receive variadic string args and may return
any JSON-serializable value.

**Consequences.** Engine stays simple; helpers own their parsing.

**Alternatives.** Parse arg types in the engine — surprising edge cases.

---

## D-010: Single-token vs embedded resolution rules

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.**
- Single-token strings (`"{{ guid }}"`) are replaced with the helper's
  actual return type.
- Embedded tokens (`"id-{{ guid }}"`) are stringified and concatenated.

**Consequences.** Authors get typed values when they want them, strings
when they need string interpolation.

---

## D-011: Reserved namespaces (`db.*`)

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1 (forward-compat for Phase 2)

**Decision.** The template engine reserves the `db.*` namespace from day
one. In Phase 1 it raises `db.* is reserved (Phase 2)`.

**Consequences.** Phase 2 can ship without breaking template syntax.

---

## D-012: Hooks mutate the response object

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Hook signature is `(req, res, ctx) => void | Promise<void>`;
mutation is the contract.

**Consequences.** No need to merge return values; clear "what you set is
what you get."

**Alternatives.** Return a new response — more functional but more
boilerplate for the common case.

---

## D-013: Hooks/templates receive a `ctx` object from day one

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** A `ctx` parameter is plumbed through templates and hooks
even though Phase 1 only populates `{ req }`.

**Consequences.** Phase 2 adds `ctx.db` non-breakingly.

---

## D-014: Hooks may be async

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** The runner always `await`s the hook's return value.

**Consequences.** Hooks can perform async work (e.g. with the Phase 2 DB,
or external `fetch` for chained mocks).

---

## D-015: Full transparent proxy fallback

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Unmatched requests are forwarded to `baseUrl` preserving
method, headers, body, status, and response headers (minus hop-by-hop).

**Consequences.** Frontend devs only mock what they need; everything else
behaves like the real backend.

---

## D-016: Recorder with include/exclude filters

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Optional record mode persists proxied responses to
`endpoints/`. Filtering via `include`/`exclude` arrays accepting strings
(prefix) or RegExps (full match).

**Consequences.** Fast bootstrapping of mock suites without recording
noise (health, metrics, internal endpoints).

---

## D-017: Recorder writes schema-formatted JSON only

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** No raw upstream snapshot file. Just `response.json` matching
the existing schema.

**Consequences.** Recorded files are immediately editable as normal mocks.
Binary bodies are skipped with a warning (out of scope, see D-?).

---

## D-018: Configuration via `mock.config.ts`

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** TypeScript config file at the project root.

**Consequences.** Type-safe, supports RegExps, inline functions; no JSON
parsing surprises.

**Alternatives.** JSON (no types), CLI-only (verbose), env-only (insecure
for headers).

---

## D-019: Global response headers (CORS) in config

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** `globalHeaders` in `mock.config.ts` are merged into every
mocked response. Per-response headers win on conflict. Proxied responses
are unaffected (upstream's headers are authoritative).

**Consequences.** CORS is a one-liner.

---

## D-020: Distribute as both CLI and library

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Provide both `bin` for CLI use and library exports
(`startServer`, types).

**Consequences.** Embedding inside test runners, dev servers, etc., is
straightforward.

---

## D-021: Bun stdlib only in Phase 1 (zero npm runtime deps)

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Phase 1 ships with no runtime npm dependencies. TypeScript
is dev-only.

**Consequences.** Tiny install footprint; minimal supply-chain surface.
Phase 3 (checker) deliberately introduces well-justified deps.

---

## D-022: In-memory DB, persistence opt-in

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 2

**Decision.** DB lives in memory by default. Persistence to `db/*.json` is
opt-in via `db.persist: true` in config.

**Consequences.** Fast and clean by default; users opt into the
operational complexity of disk writes.

---

## D-023: Auto-IDs are UUIDs

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 2

**Decision.** Records inserted without an `id` get `crypto.randomUUID()`.

**Consequences.** No collision tracking, no "last inserted id" bookkeeping.

**Alternatives.** Incrementing integers (rejected — requires per-collection
counters and persistence).

---

## D-024: Lightweight custom DB query API

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 2

**Decision.** Methods: `all`, `find`, `where`, `query`, `insert`, `update`,
`remove`. No chainable builder.

**Consequences.** Familiar shape, easy to learn, no dependency on a
LowDB-style library.

---

## D-025: DB is read-only in templates, full access in hooks

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 2

**Decision.** Templates expose `db.<name>.all`, `find`, `where`. Mutations
require a hook.

**Consequences.** Side-effect-free templating; no surprising state changes
from a JSON file.

---

## D-026: OpenAPI checker is CLI-only

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** No live proxy validation. Checker runs as `smocker check ...`.

**Consequences.** Zero impact on serve mode latency; check on demand or in
CI.

---

## D-027: Three checker modes

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** `check api` (spec ↔ real), `check mocks` (spec ↔ local),
`check all` (both).

**Consequences.** One tool covers contract verification across the entire
mock + real stack.

---

## D-028: Auto-generate request bodies + manual override

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** Request bodies are synthesized from the request schema by
default; users can override with `openapi.check.sampleData`.

**Consequences.** Quick to start, customizable when synthesis fails real
business validation.

---

## D-029: Use Ajv + ajv-formats + ref-parser

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** Adopt established libraries instead of homegrown validation.

**Consequences.** Phase 3 introduces the project's first runtime deps —
all well-maintained, widely used.

---

## D-030: Text-only checker reports for v1

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** Terminal text output only. JSON / JUnit / HTML reports are
out of scope for v1.

**Consequences.** Simpler to implement; CI can grep on text. Structured
outputs deferred until users demand them.

---

## D-031: Configurable warn vs fail behavior

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 3

**Decision.** Default is warn-only (exit 0). Opt-in fail mode via
`--fail` flag or `openapi.check.failOnMismatch: true` for CI.

**Consequences.** Friendly local UX; rigorous CI when desired.

---

## D-032: No hot reload

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1

**Decision.** Server does not watch files. Manual restart picks up changes
to `endpoints/`, `helpers/`, or `mock.config.ts`.

**Consequences.** Avoids module-cache invalidation complexity. Bun
restarts in milliseconds.

---

## D-033: Reserve `smocker check` CLI subcommand in Phase 1

- **Date:** 2026-04-21
- **Status:** Accepted
- **Phase:** 1 (forward-compat for Phase 3)

**Decision.** Phase 1 ships a stub `check` subcommand printing a "not yet
implemented" notice.

**Consequences.** Stable CLI surface across phases; no breaking change in
Phase 3.

---

## D-034: Auto-CRUD generation deferred (open question)

- **Date:** 2026-04-21
- **Status:** Open / Deferred
- **Phase:** 2 (or later)

**Decision.** Whether to auto-generate REST handlers from DB collections is
deferred for future discussion. Tracked in `tasks/phase-2/06-auto-crud-decision.md`.

**Consequences.** Phase 2 ships explicit-handler-only; the door stays open.
