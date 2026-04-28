import type { Report, CheckResult, OpReport, DiffReport } from './types';

export function createReport(): Report {
  return {
    ops: [],
    totals: {
      checked: 0,
      mismatches: 0,
      warnings: 0,
      skipped: 0,
    },
  };
}

export function setApiResult(report: Report, method: string, path: string, result: CheckResult): void {
  upsertOp(report, method, path).api = result;
  refreshTotals(report);
}

export function setMockResult(report: Report, method: string, path: string, result: CheckResult): void {
  upsertOp(report, method, path).mock = result;
  refreshTotals(report);
}

export function reportToJson(report: Report): string {
  const json = {
    totals: report.totals,
    endpoints: report.ops.map((op) => ({
      method: op.method,
      path: op.path,
      api: op.api ?? null,
      mock: op.mock ?? null,
    })),
  };
  return JSON.stringify(json, null, 2);
}

export function printReport(report: Report): void {
  const useColor = Boolean(process.stdout.isTTY);
  const lines: string[] = [];

  for (const op of report.ops) {
    const status = summarizeOp(op);
    lines.push(`${symbolFor(status)} ${op.method} ${op.path}`);

    if (op.api) {
      lines.push(...formatChannel('Real API', op.api, useColor));
    }
    if (op.mock) {
      lines.push(...formatChannel('Mock', op.mock, useColor));
    }

    lines.push('');
  }

  lines.push(
    `${report.totals.checked} endpoints checked · ${countLabel(report.totals.mismatches, 'mismatch', 'mismatches')} · ` +
      `${countLabel(report.totals.warnings, 'warning', 'warnings')}`,
  );

  console.log(lines.join('\n'));
}

function upsertOp(report: Report, method: string, path: string): OpReport {
  let existing = report.ops.find((op) => op.method === method && op.path === path);
  if (existing) {
    return existing;
  }

  existing = { method, path };
  report.ops.push(existing);
  report.ops.sort((left, right) => (left.path === right.path ? left.method.localeCompare(right.method) : left.path.localeCompare(right.path)));
  return existing;
}

function refreshTotals(report: Report): void {
  let mismatches = 0;
  let warnings = 0;
  let skipped = 0;

  for (const op of report.ops) {
    for (const result of [op.api, op.mock]) {
      if (!result) {
        continue;
      }

      if (result.status === 'mismatch' || result.status === 'error') {
        mismatches += 1;
      }
      if (result.status === 'missing' || result.status === 'undocumented') {
        warnings += 1;
      }
      if (result.status === 'skipped') {
        skipped += 1;
      }
    }
  }

  report.totals = {
    checked: report.ops.length,
    mismatches,
    warnings,
    skipped,
  };
}

function summarizeOp(op: OpReport): CheckResult['status'] {
  const statuses = [op.api?.status, op.mock?.status].filter(Boolean) as CheckResult['status'][];
  if (statuses.some((status) => status === 'mismatch' || status === 'error')) {
    return 'mismatch';
  }
  if (statuses.some((status) => status === 'missing' || status === 'undocumented')) {
    return 'missing';
  }
  if (statuses.some((status) => status === 'skipped')) {
    return 'skipped';
  }
  return 'ok';
}

function formatChannel(label: string, result: CheckResult, _useColor: boolean): string[] {
  const lines: string[] = [];
  const statusLabel = channelSummary(result);

  lines.push(`  ${label}: ${statusLabel}`);
  for (const issue of result.issues) {
    lines.push(`           ${issue.message} ${symbolFor('mismatch')}`);
  }

  return lines;
}

function channelSummary(result: CheckResult): string {
  switch (result.status) {
    case 'ok':
      return 'matches spec';
    case 'missing':
    case 'undocumented':
    case 'skipped':
    case 'error':
    case 'mismatch':
      return result.note ?? result.status;
    default:
      return result.status;
  }
}

function symbolFor(status: CheckResult['status']): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'missing':
    case 'undocumented':
      return '⚠';
    case 'skipped':
      return '…';
    case 'mismatch':
    case 'error':
      return '✗';
    default:
      return '·';
  }
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function printDiffReport(diff: DiffReport): void {
  const lines: string[] = [];

  const groups: { label: string; symbol: string; entries: typeof diff.entries }[] = [
    { label: 'Regressions', symbol: '✗', entries: diff.entries.filter((e) => e.change === 'regression') },
    { label: 'Fixed', symbol: '✓', entries: diff.entries.filter((e) => e.change === 'fixed') },
    { label: 'New', symbol: '+', entries: diff.entries.filter((e) => e.change === 'new') },
    { label: 'Removed', symbol: '−', entries: diff.entries.filter((e) => e.change === 'removed') },
  ];

  for (const group of groups) {
    if (group.entries.length === 0) continue;
    lines.push(`${group.label} (${group.entries.length}):`);
    for (const entry of group.entries) {
      lines.push(`  ${group.symbol} ${entry.method} ${entry.path}`);

      if (entry.change === 'regression' || entry.change === 'fixed') {
        const prevStatus = entry.previous?.status ?? '?';
        const currStatus = entry.current?.status ?? '?';
        lines.push(`     was: ${prevStatus} → now: ${currStatus}`);
      }
    }
    lines.push('');
  }

  lines.push(
    `${diff.summary.total} total · ` +
      `${countLabel(diff.summary.regressions, 'regression', 'regressions')} · ` +
      `${countLabel(diff.summary.fixed, 'fixed', 'fixed')} · ` +
      `${countLabel(diff.summary.new, 'new', 'new')} · ` +
      `${countLabel(diff.summary.removed, 'removed', 'removed')} · ` +
      `${diff.summary.unchanged} unchanged`,
  );

  console.log(lines.join('\n'));
}
