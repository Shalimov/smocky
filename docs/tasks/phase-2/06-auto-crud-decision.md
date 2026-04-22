# Task T-2.06: Auto-CRUD Decision

## Status
- [x] Deferred (2026-04-22)

## Goal
Decide whether (and how) to auto-generate REST handlers for endpoint folders
that match a DB collection but have no `response.json`.

## Decision
Deferred on 2026-04-22.

Phase 2 shipped the explicit DB API, template reads, hook mutations, seeding,
and optional persistence without adding auto-generated routes. This keeps the
runtime predictable and aligned with the existing convention that routes are
declared by files under `endpoints/`.

If revisited later, add a new follow-up task instead of silently extending the
current Phase 2 scope.

## Context
Tracked decision **D-034** (Open / Deferred). This task is a decision-making
exercise, not pure implementation. If accepted, follow-up implementation
tasks will be added to Phase 2.

## Inputs / Prerequisites
- T-2.03 complete (DB available in context).
- Read: [`architecture/11-database.md`](../../architecture/11-database.md) §
  Auto-CRUD, [`architecture/13-out-of-scope.md`](../../architecture/13-out-of-scope.md).
- Decision: D-034.

## Deliverables
- A short proposal in this file with the chosen direction.
- If implementation is approved: a follow-up task file (`08-auto-crud-impl.md`).

## Implementation Notes (if approved)

### Default Mapping
| Method  | Path           | Action                    |
|---------|----------------|---------------------------|
| GET     | /users         | `users.all()`             |
| GET     | /users/_id     | `users.find(id)` or 404   |
| POST    | /users         | `users.insert(body)`      |
| PUT     | /users/_id     | `users.update(id, body)`  |
| PATCH   | /users/_id     | `users.update(id, body)`  |
| DELETE  | /users/_id     | `users.remove(id)`        |

### Activation
- Opt-in via config: `db.autoCrud: true`.
- Or per-collection: `db.autoCrud: ['users']`.

### Override Rules
- An explicit `response.json` always wins.
- A hook may complement an auto-CRUD route to perform validation /
  shaping.

### Risks
- "Magic" routes that don't appear in `endpoints/` may surprise users.
- Listing routes (T-1.10 startup banner) must enumerate them.

## Acceptance Criteria
- [ ] Decision recorded in this file (Accept / Reject / Defer with date).
- [ ] If accepted: implementation task added; D-034 status updated.
- [ ] If rejected: rationale captured; D-034 marked `Rejected`.

## Out of Scope
- Implementation work (gated on the decision).

## References
- D-034
- [`architecture/11-database.md`](../../architecture/11-database.md)
