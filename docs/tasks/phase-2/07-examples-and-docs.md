# Task T-2.07: Examples & Docs

## Status
- [ ] Not started

## Goal
Update the example scaffold and README with DB-backed mocks so users can
see Phase 2 in action.

## Context
Closes Phase 2. Demonstrates seeding, hook mutations, and template reads.

## Inputs / Prerequisites
- T-2.01–T-2.05 complete (T-2.06 may be Defer/Reject).
- Read: T-1.12, T-1.13.

## Deliverables
- `db/users.json` (seed)
- Update `endpoints/users/response.json` to use `{{ db.users.all }}`.
- New `endpoints/users/_id/hook.ts` example using `ctx.db`.
- Update `README.md` with a "Stateful Mocks" section linking to
  `docs/architecture/11-database.md`.

## Implementation Notes

### Seed
```json
[
  { "id": "u1", "name": "Alice", "active": true },
  { "id": "u2", "name": "Bob",   "active": false }
]
```

### Updated `response.json`
```json
{
  "GET":  { "body": "{{ db.users.all }}" },
  "POST": { "status": 201, "body": "{{ req.body }}" }
}
```
(POST is left to the hook to do the actual `insert`.)

### Updated hook
```ts
const hook: Hook = (req, res, ctx) => {
  const users = ctx.db!.collection('users');
  if (req.method === 'POST') {
    res.body = users.insert(req.body as object);
    res.status = 201;
  }
};
```

### README Section
- Show seed file.
- Show hook calling `insert`.
- Show template reading collection.
- Note: persistence opt-in.

## Acceptance Criteria
- [ ] Curl flow demonstrates GET → POST → GET reflecting the new record.
- [ ] README explains stateful mocks in <50 lines.
- [ ] Links to architecture docs.

## Out of Scope
- Auto-CRUD examples (depends on T-2.06).

## References
- D-022, D-024, D-025
- [`architecture/11-database.md`](../../architecture/11-database.md)
