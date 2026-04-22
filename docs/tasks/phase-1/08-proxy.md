# Task T-1.08: Proxy

## Status
- [x] Complete (2026-04-22)

## Goal
Implement the transparent proxy that forwards unmatched requests to
`baseUrl` while preserving method, headers, body, status, and response
headers (minus hop-by-hop).

## Context
The fall-through path of the request lifecycle. Critical for the "mock
only what you need" workflow.

## Inputs / Prerequisites
- T-1.02 complete.
- Read: [`architecture/08-proxy-and-recorder.md`](../../architecture/08-proxy-and-recorder.md).
- Decisions: D-015.

## Deliverables
- `src/proxy.ts`

## Implementation Notes

### Public API
```ts
export interface Proxy {
  forward(req: Request): Promise<Response>;
}

export function createProxy(baseUrl: string, opts?: { timeoutMs?: number }): Proxy;
```

### Implementation
```ts
const HOP_BY_HOP = [
  'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
];

async function forward(req: Request): Promise<Response> {
  const inUrl = new URL(req.url);
  const upstream = new URL(inUrl.pathname + inUrl.search, baseUrl);

  const headers = new Headers(req.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set('host', upstream.host);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 30000);

  try {
    const res = await fetch(upstream, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      redirect: 'manual',
      signal: ctrl.signal,
    });
    return res;
  } catch (err: any) {
    const code = err.name === 'AbortError' ? 504 : 502;
    return new Response(
      JSON.stringify({ error: 'ProxyError', message: err.message }),
      { status: code, headers: { 'content-type': 'application/json' } },
    );
  } finally {
    clearTimeout(timer);
  }
}
```

### No `baseUrl`
When `baseUrl` is unset, server bootstrap handles unmatched routes before the
proxy is invoked and returns `404`. The proxy module itself assumes it was
constructed with a usable upstream URL.

### Body Streaming
Bun's `fetch` accepts a `ReadableStream` body — passing `req.body`
directly avoids buffering.

### Logging
Log each proxied request at debug level:
```
[proxy] GET /users/42 → 200 (123 ms)
```

## Acceptance Criteria
- [ ] Method, query, and body are preserved.
- [ ] Hop-by-hop headers stripped.
- [ ] `Host` header rewritten to upstream.
- [ ] Network errors return 502 JSON.
- [ ] Timeouts return 504.
- [ ] Returns a fresh `Response` whose body streams to the client.

## Out of Scope
- Recorder (T-1.09).
- Live response validation (Phase 3 explicitly excluded — D-026).

## References
- D-015
- [`architecture/08-proxy-and-recorder.md`](../../architecture/08-proxy-and-recorder.md)
