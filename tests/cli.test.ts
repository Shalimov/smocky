import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { runCheckCommand } from '../src/checker/orchestrator';
import { startServer } from '../src/index';
import { withTempDir, writeText, getFreePort } from './test-utils';

let originalLog: typeof console.log;
let originalError: typeof console.error;
let captured = false;

const logLines: string[] = [];
const errorLines: string[] = [];

afterEach(() => {
  if (!captured) return;
  console.log = originalLog!;
  console.error = originalError!;
  logLines.length = 0;
  errorLines.length = 0;
  captured = false;
});

describe('CLI commands', () => {
  test('startServer rejects invalid port', async () => {
    await expect(startServer({ port: -1 })).rejects.toThrow('invalid port');
  });

  test('startServer rejects invalid baseUrl', async () => {
    await expect(startServer({ baseUrl: 'not-a-url' })).rejects.toThrow('invalid baseUrl');
  });

  test('runCheckCommand returns 1 when openapi.spec is not configured', async () => {
    captureConsole();

    const code = await runCheckCommand({
      config: '/tmp/does-not-exist.smocky.config.ts',
      target: 'api',
    });
    expect(code).toBe(1);
    expect(errorLines.join('\n')).toContain('openapi.spec is not configured');
  });

  test('runCheckCommand check api respects baseUrl override', async () => {
    captureConsole();

    const port = await getFreePort();
    const upstream = Bun.serve({
      port,
      fetch(req: Request): Response {
        const url = new URL(req.url);
        if (req.method === 'GET' && url.pathname === '/ping') {
          return Response.json({ ok: true });
        }
        return Response.json({ error: 'not found' }, { status: 404 });
      },
    });

    try {
      await withTempDir('smocky-cli-check', async (dir) => {
        const configPath = join(dir, 'smocky.config.ts');
        const specPath = join(dir, 'openapi.json');
        await writeText(
          configPath,
          [
            `export default {`,
            `  baseUrl: 'http://127.0.0.1:1',`,
            `  openapi: {`,
            `    spec: ${JSON.stringify(specPath)},`,
            `    check: {`,
            `      timeout: 1000,`,
            `      failOnMismatch: false,`,
            `    },`,
            `  },`,
            `};`,
            ``,
          ].join('\n'),
        );
        await writeText(
          specPath,
          JSON.stringify({
            openapi: '3.0.3',
            info: { title: 'x', version: '1' },
            paths: {
              '/ping': {
                get: {
                  responses: {
                    '200': {
                      description: 'ok',
                      content: {
                        'application/json': {
                          schema: {
                            type: 'object',
                            required: ['ok'],
                            properties: {
                              ok: { type: 'boolean' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        );

        const code = await runCheckCommand({
          config: configPath,
          baseUrl: `http://127.0.0.1:${port}`,
          target: 'api',
        });
        expect(code).toBe(0);
      });
    } finally {
      upstream.stop(true);
    }

    expect(logLines.join('\n')).toContain('GET /ping');
    expect(logLines.join('\n')).toContain('matches spec');
  });
});

function captureConsole(): void {
  originalLog = console.log;
  originalError = console.error;
  captured = true;

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  };
}
