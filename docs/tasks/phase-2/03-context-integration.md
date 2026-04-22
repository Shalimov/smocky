# Task T-2.03: Context Integration

## Status
- [ ] Not started

## Goal
Plumb the DB instance through the request lifecycle so hooks see
`ctx.db` and the responder/template engine carry it.

## Context
Phase 1 already passes a `ctx` object (D-013). This task only extends it.

## Inputs / Prerequisites
- T-2.01, T-2.02 complete.
- Read: [`architecture/05-hooks.md`](../../architecture/05-hooks.md),
  [`architecture/11-database.md`](../../architecture/11-database.md).
- Decisions: D-013, D-025.

## Deliverables
- Updates to `src/types.ts` (`Ctx.db?: Db`).
- Updates to `src/index.ts` (server bootstrap creates DB and threads it).
- Updates to `src/responder.ts` (sets `ctx.db`).

## Implementation Notes

### Type
```ts
import type { Db } from './db';
export interface Ctx {
  req: MockRequest;
  db?: Db;
}
```

### Bootstrap
```ts
const db = createDb({ autoId: cfg.db?.autoId ?? 'uuid' });
await loadSeeds(db, cfg.db?.dir ?? './db');
const responder = createResponder(cfg, engine, db);
```

### Responder
```ts
const ctx: Ctx = { req, db };
```

### Hook Authoring
With `ctx.db` available, hook authors can:

```ts
const hook: Hook = (req, res, ctx) => {
  const users = ctx.db!.collection('users');
  res.body = users.where({ active: true });
};
```

## Acceptance Criteria
- [ ] Hooks can read/write via `ctx.db`.
- [ ] Without `db` config, `ctx.db` is still defined (empty collections).
- [ ] No breaking changes to Phase 1 hooks.

## Out of Scope
- Template namespace (T-2.04).
- Persistence (T-2.05).

## References
- D-013, D-025
- [`architecture/05-hooks.md`](../../architecture/05-hooks.md)
