# Task T-2.05: Persistence Toggle

## Status
- [ ] Not started

## Goal
Implement opt-in disk persistence for the DB. When `db.persist: true`,
mutations debounce-write back to `db/<collection>.json`.

## Context
Default is in-memory (D-022). Persistence is straightforward but must be
atomic and not block requests.

## Inputs / Prerequisites
- T-2.01 complete.
- Read: [`architecture/11-database.md`](../../architecture/11-database.md).
- Decisions: D-022.

## Deliverables
- Updates to `src/db.ts` (mutation hook + `flush()`).
- New file or section: `src/db-persist.ts` (debounced writer).

## Implementation Notes

### Wiring
```ts
const persister = createPersister({ dir, debounceMs: 100 });
db.onMutation = (name) => persister.schedule(name, db.collection(name).all());
```

### Atomic Write
Write to `<file>.tmp` then `rename` to target. Use `Bun.write` or
`fs.promises.writeFile`.

### Debounce
Per-collection timer; mutations within the window collapse into one write.

### Flush
`db.flush()` cancels timers and writes synchronously. Useful at server
shutdown:

```ts
process.on('SIGINT', async () => { await db.flush(); process.exit(0); });
```

## Acceptance Criteria
- [ ] `persist: false` (default) writes nothing.
- [ ] `persist: true` writes seed files after mutations.
- [ ] Multiple rapid mutations result in one disk write per debounce
      window.
- [ ] `flush()` writes immediately and resolves only after all writes
      complete.
- [ ] Atomic write (no half-written file on crash).

## Out of Scope
- Persistence formats other than JSON arrays.
- Cross-process consistency.

## References
- D-022
- [`architecture/11-database.md`](../../architecture/11-database.md)
