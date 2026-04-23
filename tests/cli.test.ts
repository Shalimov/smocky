import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { runCli } from '../src/index';
import { withTempDir, writeText, getFreePort } from './test-utils';

let originalLog: typeof console.log;
let originalError: typeof console.error;

const logLines: string[] = [];
const errorLines: string[] = [];

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  logLines.length = 0;
  errorLines.length = 0;
});

describe('runCli', () => {
  test('prints help and exits 0', async () => {
    captureConsole();

    await expect(runCli(['--help'])).resolves.toBe(0);
    expect(logLines.join('\n')).toContain('smocker - convention-over-configuration mock server');
    expect(logLines.join('\n')).toContain('smocker check api');
  });

  test('prints version and exits 0', async () => {
    captureConsole();

    await expect(runCli(['--version'])).resolves.toBe(0);
    expect(logLines).toContain('0.1.0');
  });

  test('returns 1 when check is requested without openapi.spec configured', async () => {
    captureConsole();

    await expect(runCli(['check', 'api', '--config', '/tmp/does-not-exist.smocker.config.ts'])).resolves.toBe(1);
    expect(errorLines.join('\n')).toContain('openapi.spec is not configured');
  });

  test('returns 1 and logs parse errors for bad arguments', async () => {
    captureConsole();

    await expect(runCli(['--port'])).resolves.toBe(1);
    expect(errorLines.join('\n')).toContain('missing value for --port');

    logLines.length = 0;
    errorLines.length = 0;

    await expect(runCli(['check', 'wat'])).resolves.toBe(1);
    expect(errorLines.join('\n')).toContain('unknown check target: wat');
  });

  test('check api respects --base-url override', async () => {
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
      await withTempDir('smocker-cli-check', async (dir) => {
        const configPath = join(dir, 'smocker.config.ts');
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

        await expect(
          runCli(['check', 'api', '--config', configPath, '--base-url', `http://127.0.0.1:${port}`]),
        ).resolves.toBe(0);
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

  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errorLines.push(args.map(String).join(' '));
  };
}
