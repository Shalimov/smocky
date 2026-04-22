# Task T-1.06: Hook Runner

## Status
- [ ] Not started

## Goal
Dynamically import an endpoint's `hook.ts` (if present), cache the module,
and execute the default-exported function with `(req, res, ctx)`.

## Context
Hooks are the programmable layer over `response.json`. They mutate the
response in place (D-012), are awaited regardless of sync/async (D-014),
and receive a `ctx` that's forward-compatible with Phase 2 (D-013).

## Inputs / Prerequisites
- T-1.02 complete.
- Read: [`architecture/05-hooks.md`](../../architecture/05-hooks.md).
- Decisions: D-012, D-013, D-014.

## Deliverables
- `src/hook-runner.ts`

## Implementation Notes

```ts
import type { Hook, MockRequest, MockResponse, Ctx } from './types';

const cache = new Map<string, Hook>();

export async function runHook(
  hookFile: string | null,
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
): Promise<void> {
  if (!hookFile) return;
  let hook = cache.get(hookFile);
  if (!hook) {
    const mod = await import(hookFile);
    if (typeof mod.default !== 'function') {
      throw new HookError(`hook "${hookFile}" missing default export`);
    }
    hook = mod.default as Hook;
    cache.set(hookFile, hook);
  }
  await hook(req, res, ctx);
}

export class HookError extends Error {}
```

### Error Boundary
Throws bubble up to the responder (T-1.07), which converts them to 500s
with diagnostic bodies referencing the endpoint path/method.

### Cache Lifetime
Hook modules are cached forever within the process. Restart picks up
changes (D-032). Reload via `server.reload()` clears the cache.

## Acceptance Criteria
- [ ] `runHook(null, ...)` is a no-op.
- [ ] Hook is imported once and reused across requests.
- [ ] Async hooks are awaited.
- [ ] Hooks without default export throw `HookError`.
- [ ] Mutations to `res` survive after the call.

## Out of Scope
- Responder integration (T-1.07).
- DB context injection (Phase 2).

## References
- D-012, D-013, D-014, D-032
- [`architecture/05-hooks.md`](../../architecture/05-hooks.md)
