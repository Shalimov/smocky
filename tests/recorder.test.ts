import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createRecorder } from '../src/recorder';
import { withTempDir } from './test-utils';

describe('recorder', () => {
  test('applies include/exclude filters and records JSON responses', async () => {
    await withTempDir('smocker-recorder', async (dir) => {
      const recorder = createRecorder({
        enabled: true,
        outputDir: dir,
        include: ['/api'],
        exclude: [/^\/api\/internal/],
        overwrite: false,
      });

      expect(recorder.shouldRecord('/api/users')).toBe(true);
      expect(recorder.shouldRecord('/api/internal/stats')).toBe(false);
      expect(recorder.shouldRecord('/other')).toBe(false);

      const request = new Request('http://localhost/api/users', { method: 'GET' });
      const response = new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          'content-type': 'application/json',
          'x-trace': 'abc',
          'set-cookie': 'session=1',
        },
      });

      await recorder.record(request, response);

      const saved = JSON.parse(await readFile(join(dir, 'api', 'users', 'response.json'), 'utf8')) as {
        GET: {
          status: number;
          headers: Record<string, string>;
          body: { ok: boolean };
        };
      };

      expect(saved.GET.status).toBe(201);
      expect(saved.GET.headers).toEqual({
        'content-type': 'application/json',
        'x-trace': 'abc',
      });
      expect(saved.GET.body).toEqual({ ok: true });
    });
  });

  test('preserves existing method blocks unless overwrite is enabled and skips non-json bodies', async () => {
    await withTempDir('smocker-recorder-merge', async (dir) => {
      const recorder = createRecorder({
        enabled: true,
        outputDir: dir,
        include: [],
        exclude: [],
        overwrite: false,
      });

      const first = new Request('http://localhost/users/42', { method: 'GET' });
      const second = new Request('http://localhost/users/42', { method: 'GET' });
      const post = new Request('http://localhost/users/42', { method: 'POST' });

      await recorder.record(first, Response.json({ version: 1 }));
      await recorder.record(second, Response.json({ version: 2 }));
      await recorder.record(post, Response.json({ created: true }));
      await recorder.record(
        new Request('http://localhost/html', { method: 'GET' }),
        new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
      );

      const saved = JSON.parse(await readFile(join(dir, 'users', '42', 'response.json'), 'utf8')) as {
        GET: { body: { version: number } };
        POST: { body: { created: boolean } };
      };

      expect(saved.GET.body).toEqual({ version: 1 });
      expect(saved.POST.body).toEqual({ created: true });
      await expect(readFile(join(dir, 'html', 'response.json'), 'utf8')).rejects.toThrow();
    });
  });
});
