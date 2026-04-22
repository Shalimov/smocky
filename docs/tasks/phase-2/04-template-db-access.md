# Task T-2.04: Template DB Access

## Status
- [ ] Not started

## Goal
Lift the Phase 1 guard on `db.*` template tokens and implement the
read-only collection accessors.

## Context
Phase 1 reserves `db.*` and throws. Phase 2 supports read methods only —
mutations require a hook (D-025).

## Inputs / Prerequisites
- T-2.03 complete.
- Read: [`architecture/04-templating.md`](../../architecture/04-templating.md),
  [`architecture/11-database.md`](../../architecture/11-database.md).
- Decisions: D-011, D-025.

## Deliverables
- Updates to `src/template.ts`.

## Implementation Notes

### Resolution
Tokens of shape `db.<collection>.<method> [args]`:

```ts
async function resolveDb(expr: string, args: string[], ctx: Ctx) {
  if (!ctx.db) throw new TemplateError('db unavailable');
  const [_, name, method] = expr.split('.');
  const col = ctx.db.collection(name);
  switch (method) {
    case 'all':  return col.all();
    case 'find': return col.find(args[0] ?? '');
    case 'where': return col.where(parseKv(args));
    default: throw new TemplateError(`db.${name}.${method} not supported in templates`);
  }
}
```

### `parseKv` for `where`
Args like `active=true status=open` parsed into `{ active: true, status: 'open' }`. Coerce
`true`/`false`/numerics where unambiguous.

### Mutating Methods
`insert`, `update`, `remove` raise:
```
TemplateError: db.<col>.insert: mutations are not allowed in templates — use a hook
```

## Acceptance Criteria
- [ ] `{{ db.users.all }}` returns the collection.
- [ ] `{{ db.users.find req.params.id }}` resolves correctly.
- [ ] `{{ db.users.where active=true }}` filters.
- [ ] Mutation tokens raise a descriptive error.
- [ ] Phase 1 guard removed (or relaxed) cleanly.

## Out of Scope
- Persistence (T-2.05).

## References
- D-011, D-025
- [`architecture/04-templating.md`](../../architecture/04-templating.md)
