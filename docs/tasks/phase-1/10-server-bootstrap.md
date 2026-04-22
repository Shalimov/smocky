# Task T-1.10: Server Bootstrap

## Status
- [x] Complete (2026-04-22)

## Goal
Wire all Phase 1 modules together behind `Bun.serve` and expose
`startServer()` as the library's entry point.

## Context
This is the central composition root. It orchestrates config loading,
helper discovery, router build, responder, proxy, and recorder.

## Inputs / Prerequisites
- T-1.02 through T-1.09 complete.
- Read: [`architecture/03-request-lifecycle.md`](../../architecture/03-request-lifecycle.md),
  [`architecture/10-public-api.md`](../../architecture/10-public-api.md).
- Decisions: D-019, D-020.

## Deliverables
- `src/index.ts` — public exports + `startServer` + entry-point dispatch.

## Implementation Notes

### Library Surface
```ts
export { defineConfig } from './config';
export type {
  Config, Hook, Helper, MockRequest, MockResponse, Ctx,
} from './types';

export interface ServerHandle {
  port: number;
  url: string;
  stop(): Promise<void>;
  reload(): Promise<void>;
}

export interface StartOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean;
}

export async function startServer(opts: StartOptions = {}): Promise<ServerHandle> { /* ... */ }
```

### Bootstrap Sequence
1. `loadConfig(opts.config)`.
2. Apply `opts.port`, `opts.baseUrl`, `opts.record` overrides.
3. `loadHelpers(cfg.helpersDir)`.
4. `createEngine(helpers)`.
5. `buildRouter(cfg.endpointsDir)`.
6. `createResponder(cfg, engine)`.
7. `createProxy(cfg.baseUrl)`.
8. `createRecorder(cfg.record)`.
9. `Bun.serve({ port, fetch })`.
10. Log startup banner with port + route summary.

### Request Handler
```ts
async function fetch(raw: Request): Promise<Response> {
  // CORS preflight
  if (raw.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cfg.globalHeaders });
  }

  const url = new URL(raw.url);
  const match = router.match(raw.method, url.pathname);

  if (match) {
    const req = await buildMockRequest(raw, match.params);
    try {
      return await responder.respond(match, req);
    } catch (err) {
      return errorResponse(err, match);
    }
  }

  // Fall through to proxy
  const upstream = await proxy.forward(raw.clone());
  // Recorder runs after the response is obtained but before returning
  recorder.record(raw, upstream.clone()).catch(logRecorderError);
  return upstream;
}
```

### Reload
```ts
async function reload() {
  helpers = await loadHelpers(cfg.helpersDir);
  engine = createEngine(helpers);
  responder = createResponder(cfg, engine);
  router = await buildRouter(cfg.endpointsDir);
  clearHookCache();
}
```

### CLI Entry
At the bottom of `src/index.ts`:
```ts
if (import.meta.main) {
  await runCli(process.argv.slice(2));
}
```
The actual CLI parsing lives in T-1.11.

### Startup Log
```
[smocker]
  port:      3000
  baseUrl:   https://api.production.com
  endpoints: 4 routes (2 static, 2 dynamic)
  helpers:   guid, randomInt, now
  record:    disabled
```

## Acceptance Criteria
- [ ] `startServer()` returns a `ServerHandle` with `stop()`/`reload()`.
- [ ] Mocked routes bypass the proxy.
- [ ] Unmatched routes are proxied; recorder runs on success.
- [ ] OPTIONS requests return 204 with `globalHeaders`.
- [ ] Errors during mocking produce a 500 with diagnostic body.
- [ ] Server logs startup info.

## Out of Scope
- CLI argument parsing (T-1.11).
- Examples (T-1.12).

## References
- D-019, D-020
- [`architecture/03-request-lifecycle.md`](../../architecture/03-request-lifecycle.md),
  [`architecture/10-public-api.md`](../../architecture/10-public-api.md)
