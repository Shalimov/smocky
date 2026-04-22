import { describe, expect, test } from 'bun:test';

import { createProxy } from '../src/proxy';
import { getFreePort } from './test-utils';

describe('createProxy', () => {
  test('forwards method, query, body, rewrites host, and strips hop-by-hop headers on both request and response', async () => {
    const upstreamPort = await getFreePort();
    let seen: {
      method?: string;
      pathname?: string;
      search?: string;
      host?: string | null;
      connection?: string | null;
      xClient?: string | null;
      xRemoveMe?: string | null;
      body?: string;
    } = {};

    const upstream = Bun.serve({
      port: upstreamPort,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        seen = {
          method: req.method,
          pathname: url.pathname,
          search: url.search,
          host: req.headers.get('host'),
          connection: req.headers.get('connection'),
          xClient: req.headers.get('x-client'),
          xRemoveMe: req.headers.get('x-remove-me'),
          body: await req.text(),
        };

        return new Response(JSON.stringify({ ok: true }), {
          status: 202,
          headers: {
            'content-type': 'application/json',
            connection: 'x-strip-me',
            'x-strip-me': 'remove-me',
            'x-upstream': 'yes',
          },
        });
      },
    });

    try {
      const proxy = createProxy(`http://127.0.0.1:${upstreamPort}`);
      const response = await proxy.forward(
        new Request('http://localhost/api/users?q=1', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            connection: 'x-remove-me',
            'x-client': 'client',
            'x-remove-me': 'secret',
          },
          body: JSON.stringify({ name: 'Ada' }),
        }),
      );

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get('x-upstream')).toBe('yes');
      expect(response.headers.get('connection')).toBeNull();
      expect(response.headers.get('x-strip-me')).toBeNull();

      expect(seen).toEqual({
        method: 'POST',
        pathname: '/api/users',
        search: '?q=1',
        host: `127.0.0.1:${upstreamPort}`,
        connection: 'keep-alive',
        xClient: 'client',
        xRemoveMe: null,
        body: JSON.stringify({ name: 'Ada' }),
      });
    } finally {
      upstream.stop(true);
    }
  });

  test('does not send a body for GET requests', async () => {
    const upstreamPort = await getFreePort();
    let seenBody = 'unset';

    const upstream = Bun.serve({
      port: upstreamPort,
      async fetch(req: Request): Promise<Response> {
        seenBody = await req.text();
        return Response.json({ ok: true });
      },
    });

    try {
      const proxy = createProxy(`http://127.0.0.1:${upstreamPort}`);
      const response = await proxy.forward(
        new Request('http://localhost/no-body', {
          method: 'GET',
          headers: { 'content-type': 'text/plain' },
        }),
      );

      expect(response.status).toBe(200);
      expect(seenBody).toBe('');
    } finally {
      upstream.stop(true);
    }
  });

  test('returns 404 when baseUrl is missing', async () => {
    const proxy = createProxy('');
    const response = await proxy.forward(new Request('http://localhost/missing'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'NotFound',
      message: 'No mock matched and baseUrl is not configured.',
    });
  });

  test('returns 404 when baseUrl is invalid', async () => {
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };

    try {
      const proxy = createProxy('http:// bad-url');
      const response = await proxy.forward(new Request('http://localhost/missing'));

      expect(errors.join('\n')).toContain('invalid baseUrl');
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: 'NotFound',
        message: 'No mock matched and baseUrl is not configured.',
      });
    } finally {
      console.error = originalError;
    }
  });

  test('returns 502 on network failure', async () => {
    const unusedPort = await getFreePort();
    const proxy = createProxy(`http://127.0.0.1:${unusedPort}`);
    const response = await proxy.forward(new Request('http://localhost/downstream'));

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe('ProxyError');
    expect(body.message.length).toBeGreaterThan(0);
  });

  test('returns 504 on timeout', async () => {
    const upstreamPort = await getFreePort();
    const upstream = Bun.serve({
      port: upstreamPort,
      async fetch(): Promise<Response> {
        await Bun.sleep(100);
        return Response.json({ slow: true });
      },
    });

    try {
      const proxy = createProxy(`http://127.0.0.1:${upstreamPort}`, { timeoutMs: 10 });
      const response = await proxy.forward(new Request('http://localhost/slow'));

      expect(response.status).toBe(504);
      expect(await response.json()).toEqual({ error: 'ProxyTimeout' });
    } finally {
      upstream.stop(true);
    }
  });
});
