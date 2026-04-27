import { jsonResponse } from './utils';

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

const CLIENT_IP_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
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

      let incomingUrl: URL;
      try {
        incomingUrl = new URL(req.url);
      } catch {
        return jsonResponse({ error: 'ProxyError', message: 'Invalid request URL' }, 502);
      }

      if (incomingUrl.pathname.startsWith('//')) {
        return jsonResponse({ error: 'ProxyError', message: 'Invalid request path' }, 502);
      }

      const startedAt = Date.now();
      const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamBase);
      const headers = new Headers(req.headers);
      stripHopByHopHeaders(headers);
      stripClientIpHeaders(headers);
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
        rewriteLocation(responseHeaders, upstreamBase);
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

function stripClientIpHeaders(headers: Headers): void {
  for (const header of CLIENT_IP_HEADERS) {
    headers.delete(header);
  }
}

function rewriteLocation(headers: Headers, upstreamBase: URL): void {
  const location = headers.get('location');
  if (!location) {
    return;
  }

  try {
    const locationUrl = new URL(location, upstreamBase);
    if (locationUrl.host === upstreamBase.host) {
      return;
    }
    headers.set('x-original-location', location);
    headers.delete('location');
  } catch {
    // invalid location URL, leave as-is
  }
}


