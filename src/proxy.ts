const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

export interface Proxy {
  forward(req: Request): Promise<Response>;
}

export function createProxy(baseUrl: string, opts?: { timeoutMs?: number }): Proxy {
  let upstreamBase: URL | null = null;
  if (baseUrl) {
    try {
      upstreamBase = new URL(baseUrl);
    } catch {
      console.error(`[smocky] invalid baseUrl: ${baseUrl}`);
    }
  }

  return {
    async forward(req: Request): Promise<Response> {
      if (!upstreamBase) {
        return jsonResponse(
          {
            error: 'NotFound',
            message: 'No mock matched and baseUrl is not configured.',
          },
          404,
        );
      }

      const startedAt = Date.now();
      const incomingUrl = new URL(req.url);
      const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);
      const headers = new Headers(req.headers);
      stripHopByHopHeaders(headers);
      headers.set('host', upstreamUrl.host);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);

      try {
        const upstreamResponse = await fetch(upstreamUrl, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body,
          redirect: 'manual',
          signal: controller.signal,
        });

        console.debug(
          `[proxy] ${req.method.toUpperCase()} ${incomingUrl.pathname} -> ${upstreamResponse.status} (${Date.now() - startedAt} ms)`,
        );

        const responseHeaders = new Headers(upstreamResponse.headers);
        stripHopByHopHeaders(responseHeaders);
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return jsonResponse({ error: 'ProxyTimeout' }, 504);
        }

        return jsonResponse(
          {
            error: 'ProxyError',
            message: error instanceof Error ? error.message : String(error),
          },
          502,
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function stripHopByHopHeaders(headers: Headers): void {
  const connectionValue = headers.get('connection');
  if (connectionValue) {
    for (const token of connectionValue.split(',')) {
      const header = token.trim().toLowerCase();
      if (header) {
        headers.delete(header);
      }
    }
  }

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
