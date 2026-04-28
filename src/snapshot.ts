import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { ResponseMethodBlock, ResponseDefinition } from './types';

export interface SnapshotDiff {
  path: string;
  method: string;
  change: 'added' | 'removed' | 'modified';
  previous?: ResponseMethodBlock;
  current?: ResponseMethodBlock;
}

export interface SnapshotReport {
  diffs: SnapshotDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

export async function compareSnapshots(
  baselineDir: string,
  currentDir: string,
): Promise<SnapshotReport> {
  const baseline = await loadSnapshotMap(baselineDir);
  const current = await loadSnapshotMap(currentDir);

  const diffs: SnapshotDiff[] = [];
  let totalMethods = 0;
  const allKeys = new Set([...baseline.keys(), ...current.keys()]);

  for (const key of allKeys) {
    const prevDef = baseline.get(key);
    const currDef = current.get(key);

    const methods = new Set([
      ...Object.keys(prevDef ?? {}).map((m) => m.toUpperCase()),
      ...Object.keys(currDef ?? {}).map((m) => m.toUpperCase()),
    ]);
    totalMethods += methods.size;

    const prevUpper = uppercaseKeys(prevDef ?? {});
    const currUpper = uppercaseKeys(currDef ?? {});

    if (!prevDef && currDef) {
      for (const m of methods) {
        diffs.push({ path: key, method: m, change: 'added', previous: undefined, current: currUpper[m] });
      }
    } else if (prevDef && !currDef) {
      for (const m of methods) {
        diffs.push({ path: key, method: m, change: 'removed', previous: prevUpper[m], current: undefined });
      }
    } else if (prevDef && currDef) {
      for (const m of methods) {
        const prevBlock = prevUpper[m] ?? undefined;
        const currBlock = currUpper[m] ?? undefined;

        if (!prevBlock && currBlock) {
          diffs.push({ path: key, method: m, change: 'added', previous: undefined, current: currBlock });
        } else if (prevBlock && !currBlock) {
          diffs.push({ path: key, method: m, change: 'removed', previous: prevBlock, current: undefined });
        } else if (prevBlock && currBlock) {
          const prevNorm = normalizeBlock(prevBlock);
          const currNorm = normalizeBlock(currBlock);
          if (prevNorm !== currNorm) {
            diffs.push({ path: key, method: m, change: 'modified', previous: prevBlock, current: currBlock });
          }
        }
      }
    }
  }

  diffs.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  return {
    diffs,
    summary: {
      added: diffs.filter((d) => d.change === 'added').length,
      removed: diffs.filter((d) => d.change === 'removed').length,
      modified: diffs.filter((d) => d.change === 'modified').length,
      unchanged: totalMethods - diffs.length,
    },
  };
}

export function printSnapshotReport(report: SnapshotReport): void {
  const lines: string[] = [];

  if (report.diffs.length === 0) {
    lines.push('[snapshot] no changes detected');
  } else {
    const groups: { label: string; symbol: string; diffs: SnapshotDiff[] }[] = [
      { label: 'Modified', symbol: '~', diffs: report.diffs.filter((d) => d.change === 'modified') },
      { label: 'Added', symbol: '+', diffs: report.diffs.filter((d) => d.change === 'added') },
      { label: 'Removed', symbol: '−', diffs: report.diffs.filter((d) => d.change === 'removed') },
    ];

    for (const group of groups) {
      if (group.diffs.length === 0) continue;
      lines.push(`${group.label} (${group.diffs.length}):`);
      for (const diff of group.diffs) {
        lines.push(`  ${group.symbol} ${diff.method} ${diff.path}`);
      }
      lines.push('');
    }
  }

  lines.push(
    `${report.summary.added} added · ${report.summary.removed} removed · ${report.summary.modified} modified · ${report.summary.unchanged} unchanged`,
  );

  console.log(lines.join('\n'));
}

async function loadSnapshotMap(dir: string): Promise<Map<string, ResponseDefinition>> {
  const map = new Map<string, ResponseDefinition>();

  try {
    await walkForResponses(dir, '', map);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return map;
}

async function walkForResponses(
  root: string,
  subpath: string,
  map: Map<string, ResponseDefinition>,
): Promise<void> {
  const currentDir = subpath ? join(root, subpath) : root;
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'response.json') {
      const filePath = join(currentDir, entry.name);
      try {
        const raw = await readFile(filePath, 'utf8');
        const def = JSON.parse(raw) as ResponseDefinition;
        map.set(normalizePath(subpath), def);
      } catch {
        // skip unreadable files
      }
    } else if (entry.isDirectory()) {
      await walkForResponses(root, subpath ? `${subpath}/${entry.name}` : entry.name, map);
    }
  }
}

function normalizePath(subpath: string): string {
  return subpath ? `/${subpath}` : '/';
}

function uppercaseKeys(def: ResponseDefinition): Record<string, ResponseMethodBlock> {
  const result: Record<string, ResponseMethodBlock> = {};
  for (const [key, value] of Object.entries(def)) {
    result[key.toUpperCase()] = value;
  }
  return result;
}

function normalizeBlock(block: ResponseMethodBlock): string {
  return JSON.stringify(
    {
      status: block.status ?? 200,
      headers: block.headers ?? {},
      body: block.body ?? null,
      delay: block.delay ?? 0,
    },
    sortedKeys,
    2,
  );
}

function sortedKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();
    for (const k of keys) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
