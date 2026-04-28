import { readFile } from 'node:fs/promises';

import type { CheckResult, DiffEntry, DiffReport, OpReport, Report } from './types';

interface BaselineEntry {
  method: string;
  path: string;
  api: CheckResult | null;
  mock: CheckResult | null;
}

interface BaselineFile {
  totals: Report['totals'];
  endpoints: BaselineEntry[];
}

export async function loadBaseline(path: string): Promise<Report> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as BaselineFile;

  if (!Array.isArray(parsed.endpoints)) {
    throw new Error(`[smocky] baseline file ${path} is missing 'endpoints' array`);
  }

  const ops: OpReport[] = parsed.endpoints.map((ep) => ({
    method: ep.method,
    path: ep.path,
    api: ep.api ?? undefined,
    mock: ep.mock ?? undefined,
  }));

  return {
    ops,
    totals: {
      checked: ops.length,
      mismatches: 0,
      warnings: 0,
      skipped: 0,
    },
  };
}

export function computeDiff(baseline: Report, current: Report): DiffReport {
  const entries: DiffEntry[] = [];

  const baselineMap = new Map<string, OpReport>();
  for (const op of baseline.ops) {
    baselineMap.set(key(op.method, op.path), op);
  }

  const currentMap = new Map<string, OpReport>();
  for (const op of current.ops) {
    currentMap.set(key(op.method, op.path), op);
  }

  const allKeys = new Set([...baselineMap.keys(), ...currentMap.keys()]);

  for (const k of allKeys) {
    const prev = baselineMap.get(k) ?? null;
    const curr = currentMap.get(k) ?? null;

    let change: DiffEntry['change'];

    if (prev && curr) {
      const prevStatus = worstStatus(prev);
      const currStatus = worstStatus(curr);

      if (prevStatus === currStatus) {
        change = 'unchanged';
      } else if (statusSeverity(currStatus) > statusSeverity(prevStatus)) {
        change = 'regression';
      } else {
        change = 'fixed';
      }
    } else if (!prev && curr) {
      change = 'new';
    } else if (prev && !curr) {
      change = 'removed';
    } else {
      continue;
    }

    const method = prev?.method ?? curr?.method ?? '';
    const path = prev?.path ?? curr?.path ?? '';

    entries.push({
      method,
      path,
      change,
      previous: prev ? pickWorstResult(prev) : null,
      current: curr ? pickWorstResult(curr) : null,
    });
  }

  entries.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  return {
    entries,
    summary: {
      total: entries.length,
      regressions: entries.filter((e) => e.change === 'regression').length,
      fixed: entries.filter((e) => e.change === 'fixed').length,
      new: entries.filter((e) => e.change === 'new').length,
      removed: entries.filter((e) => e.change === 'removed').length,
      unchanged: entries.filter((e) => e.change === 'unchanged').length,
    },
  };
}

function key(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function worstStatus(op: OpReport): CheckResult['status'] {
  const statuses = [op.api?.status, op.mock?.status].filter(Boolean) as CheckResult['status'][];
  let worst: CheckResult['status'] = 'ok';
  for (const s of statuses) {
    if (statusSeverity(s) > statusSeverity(worst)) {
      worst = s;
    }
  }
  return worst;
}

function pickWorstResult(op: OpReport): CheckResult {
  const candidates = [op.api, op.mock].filter(Boolean) as CheckResult[];
  if (candidates.length === 0) {
    return { status: 'ok', issues: [] };
  }
  let worst = candidates[0]!;
  for (const c of candidates) {
    if (statusSeverity(c.status) > statusSeverity(worst.status)) {
      worst = c;
    }
  }
  return worst;
}

function statusSeverity(status: CheckResult['status']): number {
  switch (status) {
    case 'error':
      return 4;
    case 'mismatch':
      return 3;
    case 'missing':
    case 'undocumented':
      return 2;
    case 'skipped':
      return 1;
    case 'ok':
      return 0;
  }
}
