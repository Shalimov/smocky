import { describe, expect, test } from 'bun:test';
import { computeDiff, loadBaseline } from '../src/checker/diff';
import { reportToJson, printDiffReport, createReport, setMockResult } from '../src/checker/reporter';
import type { CheckResult, Report } from '../src/checker/types';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeReport(ops: Array<{ method: string; path: string; mockStatus: CheckResult['status'] }>): Report {
  const report = createReport();
  for (const op of ops) {
    setMockResult(report, op.method, op.path, {
      status: op.mockStatus,
      issues: [],
      note: op.mockStatus,
    });
  }
  return report;
}

describe('computeDiff', () => {
  test('detects regressions', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'mismatch' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.regressions).toBe(1);
    expect(diff.summary.fixed).toBe(0);
    expect(diff.entries[0]!.change).toBe('regression');
  });

  test('detects fixes', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'mismatch' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.fixed).toBe(1);
    expect(diff.summary.regressions).toBe(0);
    expect(diff.entries[0]!.change).toBe('fixed');
  });

  test('detects new endpoints', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
      { method: 'POST', path: '/users', mockStatus: 'ok' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.new).toBe(1);
  });

  test('detects removed endpoints', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
      { method: 'POST', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.removed).toBe(1);
  });

  test('detects unchanged endpoints', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.unchanged).toBe(1);
  });

  test('error to ok is a fix', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'error' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.fixed).toBe(1);
  });

  test('ok to missing is a regression', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'missing' },
    ]);

    const diff = computeDiff(baseline, current);
    expect(diff.summary.regressions).toBe(1);
  });
});

describe('reportToJson', () => {
  test('produces valid JSON with endpoints', () => {
    const report = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
      { method: 'POST', path: '/users', mockStatus: 'mismatch' },
    ]);

    const json = reportToJson(report);
    const parsed = JSON.parse(json);

    expect(parsed.totals).toBeDefined();
    expect(parsed.endpoints).toBeArray();
    expect(parsed.endpoints.length).toBe(2);
    expect(parsed.endpoints[0].method).toBe('GET');
    expect(parsed.endpoints[0].path).toBe('/users');
  });
});

describe('baseline save/load', () => {
  test('loadBaseline parses a baseline file', async () => {
    const tmp = join(tmpdir(), `smocky-diff-test-${Date.now()}`);
    await mkdir(tmp, { recursive: true });

    try {
      const baselinePath = join(tmp, '.smocky-baseline.json');
      const report = makeReport([
        { method: 'GET', path: '/users', mockStatus: 'ok' },
      ]);
      await writeFile(baselinePath, reportToJson(report), 'utf8');

      const loaded = await loadBaseline(baselinePath);
      expect(loaded.ops.length).toBe(1);
      expect(loaded.ops[0]!.method).toBe('GET');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('printDiffReport', () => {
  test('does not throw', () => {
    const baseline = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'ok' },
    ]);
    const current = makeReport([
      { method: 'GET', path: '/users', mockStatus: 'mismatch' },
    ]);

    const diff = computeDiff(baseline, current);

    const orig = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };

    try {
      printDiffReport(diff);
      expect(lines.length).toBeGreaterThan(0);
      const joined = lines.join('\n');
      expect(joined).toContain('Regressions');
      expect(joined).toContain('GET /users');
      expect(joined).toContain('was: ok');
      expect(joined).toContain('mismatch');
    } finally {
      console.log = orig;
    }
  });
});
