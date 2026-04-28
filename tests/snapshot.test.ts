import { describe, expect, test } from 'bun:test';
import { compareSnapshots, printSnapshotReport } from '../src/snapshot';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('compareSnapshots', () => {
  test('detects no changes when directories match', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    const resp = JSON.stringify({
      GET: { status: 200, headers: { 'content-type': 'application/json' }, body: { id: 1 } },
    });

    await writeFile(join(tmp, 'fixtures-a', 'users', 'response.json'), resp, 'utf8');
    await writeFile(join(tmp, 'fixtures-b', 'users', 'response.json'), resp, 'utf8');

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      expect(report.diffs.length).toBe(0);
      expect(report.summary.unchanged).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('detects added endpoints', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    const resp = JSON.stringify({
      GET: { status: 200, body: {} },
    });

    await writeFile(join(tmp, 'fixtures-b', 'users', 'response.json'), resp, 'utf8');

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'), // missing directory
        join(tmp, 'fixtures-b'),
      );

      expect(report.summary.added).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('detects removed endpoints', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });

    const resp = JSON.stringify({
      GET: { status: 200, body: {} },
    });

    await writeFile(join(tmp, 'fixtures-a', 'users', 'response.json'), resp, 'utf8');

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'), // missing directory
      );

      expect(report.summary.removed).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('detects modified status', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    await writeFile(
      join(tmp, 'fixtures-a', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: {} } }),
      'utf8',
    );
    await writeFile(
      join(tmp, 'fixtures-b', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 201, body: {} } }),
      'utf8',
    );

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      expect(report.summary.modified).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('detects modified body', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    await writeFile(
      join(tmp, 'fixtures-a', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: { id: 1 } } }),
      'utf8',
    );
    await writeFile(
      join(tmp, 'fixtures-b', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: { id: 2 } } }),
      'utf8',
    );

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      expect(report.summary.modified).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('ignores key ordering (normalized comparison)', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    await writeFile(
      join(tmp, 'fixtures-a', 'users', 'response.json'),
      JSON.stringify({ GET: { body: { id: 1 }, status: 200 } }), // body first
      'utf8',
    );
    await writeFile(
      join(tmp, 'fixtures-b', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: { id: 1 } } }), // status first
      'utf8',
    );

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      expect(report.diffs.length).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('handles multiple methods per endpoint', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    await writeFile(
      join(tmp, 'fixtures-a', 'users', 'response.json'),
      JSON.stringify({
        GET: { status: 200, body: {} },
        POST: { status: 201, body: {} },
      }),
      'utf8',
    );
    await writeFile(
      join(tmp, 'fixtures-b', 'users', 'response.json'),
      JSON.stringify({
        GET: { status: 200, body: {} },
        POST: { status: 200, body: {} }, // changed from 201 to 200
      }),
      'utf8',
    );

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      expect(report.summary.modified).toBe(1);
      expect(report.summary.unchanged).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('printSnapshotReport', () => {
  test('does not throw', async () => {
    const tmp = join(tmpdir(), `smocky-snapshot-${Date.now()}`);
    await mkdir(join(tmp, 'fixtures-a', 'users'), { recursive: true });
    await mkdir(join(tmp, 'fixtures-b', 'users'), { recursive: true });

    await writeFile(
      join(tmp, 'fixtures-a', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: { id: 1 } } }),
      'utf8',
    );
    await writeFile(
      join(tmp, 'fixtures-b', 'users', 'response.json'),
      JSON.stringify({ GET: { status: 200, body: { id: 2 } } }),
      'utf8',
    );

    try {
      const report = await compareSnapshots(
        join(tmp, 'fixtures-a'),
        join(tmp, 'fixtures-b'),
      );

      const orig = console.log;
      const lines: string[] = [];
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      };

      try {
        printSnapshotReport(report);
        expect(lines.length).toBeGreaterThan(0);
        const joined = lines.join('\n');
        expect(joined).toContain('Modified');
      } finally {
        console.log = orig;
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
