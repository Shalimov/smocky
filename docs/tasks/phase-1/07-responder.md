# Task T-1.07: Responder

## Status
- [ ] Not started

## Goal
Compose the per-request pipeline that turns a matched route into a final
HTTP response: load `response.json`, render templates, run the hook, apply
delay and global headers.

## Context
The responder is the orchestration layer. It does not match routes, render
templates, or run hooks itself — it calls into the modules built in
T-1.04, T-1.05, T-1.06.

## Inputs / Prerequisites
- T-1.04, T-1.05, T-1.06 complete.
- Read: [`architecture/03-request-lifecycle.md`](../../architecture/03-request-lifecycle.md),
  [`architecture/05-hooks.md`](../../architecture/05-hooks.md).
- Decisions: D-005, D-006, D-019.

## Deliverables
- `src/responder.ts`

## Implementation Notes

### Public API
```ts
import type { ResolvedConfig, MockRequest, MockResponse, Ctx } from './types';
import type { MatchResult } from './router';
import type { Engine } from './template';

export interface Responder {
  respond(match: MatchResult, req: MockRequest): Promise<Response>;
}

export function createResponder(
  cfg: ResolvedConfig,
  engine: Engine,
): Responder;
```

### Algorithm
```ts
async function respond(match, req) {
  const file = await Bun.file(match.route.responseFile).json();
  const block = file[req.method] ?? file[req.method.toLowerCase()];
  if (!block) return methodNotAllowed(match.route);

  const res: MockResponse = {
    status: block.status ?? 200,
    headers: { ...(block.headers ?? {}) },
    body: block.body ?? {},
    delay: block.delay ?? 0,
  };

  const ctx: Ctx = { req };

  // Render templates in body & header values
  res.body = await engine.render(res.body, ctx);
  res.headers = await renderHeaders(res.headers, engine, ctx);

  // Run hook
  await runHook(match.route.hookFile, req, res, ctx);

  // Merge global headers (per-response wins)
  const finalHeaders = { ...cfg.globalHeaders, ...res.headers };

  // Delay
  if (res.delay > 0) await Bun.sleep(res.delay);

  // Build Response
  const bodyStr = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  if (!finalHeaders['content-type'] && typeof res.body !== 'string') {
    finalHeaders['content-type'] = 'application/json';
  }
  return new Response(bodyStr, { status: res.status, headers: finalHeaders });
}
```

### Building `MockRequest`
```ts
async function buildMockRequest(raw: Request, params: Record<string, string>): Promise<MockRequest> {
  const url = new URL(raw.url);
  return {
    method: raw.method.toUpperCase(),
    path: url.pathname,
    params,
    query: parseQuery(url.searchParams),
    headers: headersToObject(raw.headers),
    body: await tryJson(raw),
    raw,
  };
}
```

`tryJson` parses JSON if `content-type: application/json`; otherwise reads
text or leaves undefined.

### Error Handling
Wrap the whole pipeline in try/catch. Distinguish:
- `TemplateError` → 500 with `{ error: 'TemplateError', message }`
- `HookError` → 500 with `{ error: 'HookError', endpoint, method, message }`
- Other → 500 with generic message.

## Acceptance Criteria
- [ ] `response.json` body templates resolve before being returned.
- [ ] Hook mutations survive into the final response.
- [ ] `delay` is respected (verified by timing).
- [ ] `globalHeaders` merged into mocked responses; per-response wins.
- [ ] Default content-type `application/json` for object bodies.
- [ ] Errors return 500 with diagnostic JSON body.

## Out of Scope
- Routing (T-1.05) and proxy fallback (T-1.08).

## References
- D-005, D-006, D-019
- [`architecture/03-request-lifecycle.md`](../../architecture/03-request-lifecycle.md)
