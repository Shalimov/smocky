import { writeFile } from 'node:fs/promises';

import { createDb } from '../db';
import { loadSeeds } from '../db-loader';
import { loadHelpers } from '../helpers-loader';
import { buildRouter } from '../router';
import { createEngine } from '../template';
import { loadConfig } from '../config';
import { runApiChecker } from './api-checker';
import { runMockChecker } from './mock-checker';
import { createReport, printReport, reportToJson, printDiffReport } from './reporter';
import { loadSampleOverrides } from './sample-generator';
import { loadSpec } from './spec-loader';
import { computeDiff, loadBaseline } from './diff';
import type { CheckOutputFormat } from './types';

export interface CheckOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean;
  fail?: boolean;
  target?: 'api' | 'mocks' | 'all';
  output?: string;
  out?: string;
  diff?: boolean;
  baseline?: string;
  saveBaseline?: boolean;
}

export async function runCheckCommand(opts: CheckOptions = {}): Promise<number> {
  const target = opts.target ?? 'all';
  const config = await loadConfig(opts.config);

  if (opts.port !== undefined) {
    config.port = opts.port;
  }
  if (opts.baseUrl !== undefined) {
    config.baseUrl = opts.baseUrl;
  }
  if (opts.record) {
    config.record.enabled = true;
  }

  if (!config.openapi?.spec) {
    console.error('[smocky] openapi.spec is not configured in smocky.config.ts');
    return 1;
  }

  const spec = await loadSpec(config.openapi.spec);
  const overrides = await loadSampleOverrides(config.openapi.check.sampleData);
  const report = createReport();

  if (target === 'api' || target === 'all') {
    await runApiChecker(spec, config, overrides, report);
  }

  if (target === 'mocks' || target === 'all') {
    const router = await buildRouter(config.endpointsDir);
    const helpers = await loadHelpers(config.helpersDir);
    const engine = createEngine(helpers);
    const db = createDb({ autoId: config.db.autoId });
    await loadSeeds(db, config.db.dir);
    await runMockChecker(spec, router, engine, config, overrides, report, db);
  }

  const outputFormat: CheckOutputFormat = opts.output === 'json' ? 'json' : 'text';

  if (opts.diff) {
    const baselinePath = opts.baseline ?? '.smocky-baseline.json';
    let baseline: ReturnType<typeof createReport>;

    try {
      baseline = await loadBaseline(baselinePath);
    } catch {
      console.error(`[smocky] baseline file not found: ${baselinePath}`);
      console.error('[smocky] run `smocky check --save-baseline` first or create a baseline manually');
      return 1;
    }

    const diff = computeDiff(baseline, report);
    printDiffReport(diff);

    if (opts.saveBaseline) {
      const json = reportToJson(report);
      await writeFile(baselinePath, json, 'utf8');
      console.log(`\n[smocky] baseline updated at ${baselinePath}`);
    }

    if (diff.summary.regressions > 0) {
      return 3;
    }

    return 0;
  }

  if (outputFormat === 'json') {
    const json = reportToJson(report);
    if (opts.out) {
      await writeFile(opts.out, json, 'utf8');
      console.log(`[smocky] report written to ${opts.out}`);
    } else {
      console.log(json);
    }
  } else {
    printReport(report);
  }

  if (opts.saveBaseline) {
    const baselinePath = opts.baseline ?? '.smocky-baseline.json';
    const json = reportToJson(report);
    await writeFile(baselinePath, json, 'utf8');
    console.log(`[smocky] baseline saved to ${baselinePath}`);
  }

  const failOnMismatch = opts.fail || config.openapi.check.failOnMismatch;
  if (failOnMismatch && report.totals.mismatches > 0) {
    return 3;
  }

  return 0;
}
