import { join } from 'node:path';
import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as p from '@clack/prompts';
import $RefParser from '@apidevtools/json-schema-ref-parser';

import type { OpenApiSpec, OperationDescriptor } from '../../checker/types';
import {
  describeOperation,
  listOpsByTag,
  planEndpoints,
  type BodyStrategy,
  type EndpointPlan,
} from './openapi-to-endpoint';
import { pathExists, writeFileSafe, type WriteResult } from './templates';

export interface FromOpenapiOptions {
  source: string;
  headers: Record<string, string>;
  force: boolean;
  cwd: string;
  yes: boolean;
}

export async function runFromOpenapi(opts: FromOpenapiOptions): Promise<number> {
  p.intro('smocky init --from-openapi');

  const spinner = p.spinner();
  spinner.start(`Loading spec from ${opts.source}`);

  let spec: OpenApiSpec;
  try {
    spec = await loadSpec(opts.source, opts.headers);
  } catch (err) {
    spinner.stop('Failed to load spec', 1);
    p.log.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const title = (spec.info as { title?: string } | undefined)?.title ?? '(untitled)';
  const version = (spec.info as { version?: string } | undefined)?.version ?? '?';
  spinner.stop(`Loaded ${title} v${version}`);

  const groups = listOpsByTag(spec);
  const totalOps = groups.reduce((sum, g) => sum + g.ops.length, 0);
  if (totalOps === 0) {
    p.log.warn('No operations found in spec.');
    p.outro('Nothing to do.');
    return 0;
  }

  p.log.info(`${totalOps} operation(s) across ${groups.length} tag(s).`);

  const interactive = !opts.yes && Boolean(process.stdout.isTTY);

  let selectedOps: OperationDescriptor[];
  let strategy: BodyStrategy;

  if (interactive) {
    const tagSel = await p.multiselect({
      message: 'Which tags to scaffold?',
      options: groups.map((g) => ({
        value: g.tag,
        label: `${g.tag}  (${g.ops.length} op${g.ops.length === 1 ? '' : 's'})`,
      })),
      initialValues: groups.map((g) => g.tag),
      required: true,
    });
    if (p.isCancel(tagSel)) {
      p.cancel('Aborted.');
      return 0;
    }

    const candidateOps = groups
      .filter((g) => (tagSel as string[]).includes(g.tag))
      .flatMap((g) => g.ops);

    // De-duplicate (one operation can appear under multiple tags).
    const seen = new Set<string>();
    const uniqueOps = candidateOps.filter((op) => {
      const key = `${op.method} ${op.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const opSel = await p.multiselect({
      message: 'Which operations?',
      options: uniqueOps.map((op) => ({
        value: `${op.method} ${op.path}`,
        label: describeOperation(op),
      })),
      initialValues: uniqueOps.map((op) => `${op.method} ${op.path}`),
      required: true,
    });
    if (p.isCancel(opSel)) {
      p.cancel('Aborted.');
      return 0;
    }

    const opSet = new Set(opSel as string[]);
    selectedOps = uniqueOps.filter((op) => opSet.has(`${op.method} ${op.path}`));

    const useExamples = await p.confirm({
      message: 'Use schema examples where available?',
      initialValue: true,
    });
    if (p.isCancel(useExamples)) {
      p.cancel('Aborted.');
      return 0;
    }
    const useFaker = await p.confirm({
      message: 'Generate fake data with json-schema-faker for missing examples?',
      initialValue: true,
    });
    if (p.isCancel(useFaker)) {
      p.cancel('Aborted.');
      return 0;
    }
    strategy = {
      useExamples: Boolean(useExamples),
      useFaker: Boolean(useFaker),
      emptyForUnsupported: false,
    };
  } else {
    selectedOps = groups.flatMap((g) => g.ops);
    // Dedupe
    const seen = new Set<string>();
    selectedOps = selectedOps.filter((op) => {
      const key = `${op.method} ${op.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    strategy = { useExamples: true, useFaker: true, emptyForUnsupported: false };
  }

  if (selectedOps.length === 0) {
    p.outro('No operations selected.');
    return 0;
  }

  const planResult = planEndpoints({ spec, selected: selectedOps, strategy });

  // Write smocky.config.ts only if missing — we don't overwrite a user's config.
  const configPath = join(opts.cwd, 'smocky.config.ts');
  const writes: WriteResult[] = [];
  const writeSpinner = p.spinner();
  writeSpinner.start('Writing endpoints');

  if (!(await pathExists(configPath))) {
    const minimalConfig = renderMinimalConfig();
    writes.push(await writeFileSafe(configPath, minimalConfig, { force: opts.force }));
  } else {
    writes.push({ path: configPath, outcome: 'skipped' });
  }

  for (const plan of planResult.plans) {
    const result = await writePlan(opts.cwd, plan, opts.force);
    writes.push(...result);
  }

  writeSpinner.stop('Endpoints written');

  printSummary(writes, opts.cwd);

  const allWarnings = [
    ...planResult.warnings,
    ...planResult.plans.flatMap((p) => p.warnings),
  ];
  if (allWarnings.length > 0) {
    p.note(allWarnings.join('\n'), `${allWarnings.length} warning(s)`);
  }

  p.outro(
    `Scaffolded ${planResult.plans.length} endpoint folder(s) from ${opts.source}.\nNext: bun smocky serve`,
  );
  return 0;
}

async function loadSpec(source: string, headers: Record<string, string>): Promise<OpenApiSpec> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    // Stash to a temp file so $RefParser can resolve relative refs from the URL base.
    const dir = await mkdtemp(join(tmpdir(), 'smocky-spec-'));
    const ext = source.endsWith('.yaml') || source.endsWith('.yml') ? '.yaml' : '.json';
    const tmp = join(dir, `spec${ext}`);
    await writeFile(tmp, text, 'utf8');
    const dereferenced = await $RefParser.dereference(tmp);
    return dereferenced as OpenApiSpec;
  }

  const dereferenced = await $RefParser.dereference(source);
  return dereferenced as OpenApiSpec;
}

async function writePlan(
  cwd: string,
  plan: EndpointPlan,
  force: boolean,
): Promise<WriteResult[]> {
  const responsePath = join(cwd, 'endpoints', plan.folderPath, 'response.json');
  const exists = await pathExists(responsePath);

  if (!exists) {
    const body = JSON.stringify(orderedMethodBlocks(plan.methodBlocks), null, 2) + '\n';
    return [await writeFileSafe(responsePath, body, { force })];
  }

  if (force) {
    const body = JSON.stringify(orderedMethodBlocks(plan.methodBlocks), null, 2) + '\n';
    return [await writeFileSafe(responsePath, body, { force: true })];
  }

  // Merge: add missing methods, preserve existing ones.
  try {
    const raw = await readFile(responsePath, 'utf8');
    const existing = JSON.parse(raw) as Record<string, unknown>;
    const added: string[] = [];
    for (const [method, block] of Object.entries(plan.methodBlocks)) {
      if (!(method in existing)) {
        existing[method] = block;
        added.push(method);
      }
    }
    if (added.length === 0) {
      return [{ path: responsePath, outcome: 'skipped' }];
    }
    await writeFile(responsePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    return [{ path: responsePath, outcome: 'wrote' }];
  } catch {
    return [{ path: responsePath, outcome: 'skipped' }];
  }
}

function orderedMethodBlocks(
  blocks: Record<string, { status: number; body: unknown; headers?: Record<string, string> }>,
): Record<string, unknown> {
  const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const out: Record<string, unknown> = {};
  for (const m of order) if (blocks[m]) out[m] = blocks[m];
  for (const [m, v] of Object.entries(blocks)) if (!(m in out)) out[m] = v;
  return out;
}

function renderMinimalConfig(): string {
  return [
    `import { defineConfig } from 'smocky';`,
    ``,
    `export default defineConfig({`,
    `  port: 4000,`,
    `  endpointsDir: './endpoints',`,
    `  helpersDir: './helpers',`,
    `  globalHeaders: {`,
    `    'Access-Control-Allow-Origin': '*',`,
    `  },`,
    `});`,
    ``,
  ].join('\n');
}

function printSummary(results: WriteResult[], cwd: string): void {
  const lines: string[] = [];
  for (const r of results) {
    const rel = r.path.startsWith(cwd) ? r.path.slice(cwd.length + 1) : r.path;
    if (r.outcome === 'wrote') lines.push(`  + ${rel}`);
    else if (r.outcome === 'overwrote') lines.push(`  ! ${rel}`);
    else lines.push(`  - ${rel} (skipped)`);
  }
  p.note(lines.join('\n') || '  (no files written)', 'Files');
}
