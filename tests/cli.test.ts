import { afterEach, describe, expect, test } from 'bun:test';

import { runCli } from '../src/index';

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

  test('prints check stub notice and exits 0', async () => {
    captureConsole();

    await expect(runCli(['check', 'api'])).resolves.toBe(0);
    expect(logLines.join('\n')).toContain('OpenAPI checker is planned for Phase 3');
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
