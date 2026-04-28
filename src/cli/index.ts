#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand, runMain } from 'citty';

import { startServer } from '../index';
import { runCheckCommand } from '../checker/orchestrator';
import { runInit } from './commands/init';
import { runRecord, type RecordOptions } from './commands/record';
import { compareSnapshots, printSnapshotReport } from '../snapshot';

async function readVersion(): Promise<string> {
  const packageJsonPath = resolve(import.meta.dir, '../../package.json');
  const raw = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? '0.0.0';
}

function installSignalHandlers(handle: { stop(): Promise<void> }): void {
  const shutdown = async () => {
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function collectRepeated(rawArgs: string[] | undefined, flag: string): string[] {
  if (!rawArgs) return [];
  const out: string[] = [];
  for (let i = 0; i < rawArgs.length; i += 1) {
    if (rawArgs[i] === flag) {
      const next = rawArgs[i + 1];
      if (next !== undefined) out.push(next);
    } else if (rawArgs[i]?.startsWith(`${flag}=`)) {
      out.push(rawArgs[i]!.slice(flag.length + 1));
    }
  }
  return out;
}

const main = defineCommand({
  meta: {
    name: 'smocky',
    description: 'Convention-over-configuration mock server for Bun.',
  },
  args: {
    version: { type: 'boolean', description: 'Show version' },
  },
  subCommands: {
    serve: {
      meta: { name: 'serve', description: 'Start the mock server' },
      args: {
        config: { type: 'string', description: 'Path to smocky.config.ts' },
        port: { type: 'string', description: 'Override port' },
        'base-url': { type: 'string', description: 'Override baseUrl' },
        record: { type: 'boolean', description: 'Enable recorder' },
      },
      async run({ args, rawArgs }) {
        try {
          const handle = await startServer({
            config: args.config as string | undefined,
            port: args.port ? Number(args.port) : undefined,
            baseUrl: (args['base-url'] as string | undefined) ?? undefined,
            record: rawArgs.includes('--record') ? true : undefined,
          });
          installSignalHandlers(handle);
          await new Promise<never>(() => {});
        } catch (error) {
          console.error(`[smocky] ${error instanceof Error ? error.message : String(error)}`);
          process.exit(2);
        }
      },
    },
    check: {
      meta: { name: 'check', description: 'Validate spec against API and/or local mocks' },
      args: {
        target: { type: 'positional', description: 'api | mocks | all', required: false },
        config: { type: 'string', description: 'Path to smocky.config.ts' },
        port: { type: 'string', description: 'Override port' },
        'base-url': { type: 'string', description: 'Override baseUrl' },
        fail: { type: 'boolean', description: 'Exit non-zero on mismatch' },
        output: { type: 'string', description: 'Output format: text | json' },
        out: { type: 'string', description: 'Write report to file' },
        diff: { type: 'boolean', description: 'Compare against baseline' },
        baseline: { type: 'string', description: 'Path to baseline file' },
        'save-baseline': { type: 'boolean', description: 'Save current results as baseline' },
      },
      async run({ args, rawArgs }) {
        const target = (args.target as string | undefined) ?? 'all';
        if (!['api', 'mocks', 'all'].includes(target)) {
          console.error(`[smocky] unknown check target: ${target}`);
          process.exit(1);
        }
        try {
          const code = await runCheckCommand({
            config: args.config as string | undefined,
            port: args.port ? Number(args.port) : undefined,
            baseUrl: (args['base-url'] as string | undefined) ?? undefined,
            fail: rawArgs.includes('--fail') ? true : undefined,
            target: target as 'api' | 'mocks' | 'all',
            output: args.output as string | undefined,
            out: args.out as string | undefined,
            diff: rawArgs.includes('--diff') ? true : undefined,
            baseline: args.baseline as string | undefined,
            saveBaseline: rawArgs.includes('--save-baseline') ? true : undefined,
          });
          process.exit(code);
        } catch (error) {
          console.error(`[smocky] ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      },
    },
    record: {
      meta: { name: 'record', description: 'Record real API responses as fixtures' },
      args: {
        config: { type: 'string', description: 'Path to smocky.config.ts' },
        port: { type: 'string', description: 'Override port' },
        'base-url': { type: 'string', description: 'Override baseUrl' },
        exec: { type: 'string', description: 'Command to run during recording' },
        to: { type: 'string', description: 'Output directory for fixtures' },
        overwrite: { type: 'boolean', description: 'Overwrite existing fixtures' },
        'check-snapshots': { type: 'string', description: 'Compare recorded output against a baseline directory' },
        'update-snapshots': { type: 'boolean', description: 'Update baseline with recorded output' },
      },
      async run({ args }) {
        try {
          const opts: RecordOptions = {
            config: args.config as string | undefined,
            port: args.port ? Number(args.port) : undefined,
            baseUrl: (args['base-url'] as string | undefined) ?? undefined,
            exec: args.exec as string | undefined,
            to: args.to as string | undefined,
            overwrite: args.overwrite ? true : undefined,
            checkSnapshots: (args['check-snapshots'] as string | undefined) ?? undefined,
            updateSnapshots: args['update-snapshots'] ? true : undefined,
          };
          const code = await runRecord(opts);
          process.exit(code);
        } catch (error) {
          console.error(`[smocky] ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      },
    },
    snapshot: {
      meta: { name: 'snapshot', description: 'Compare fixture snapshots' },
      args: {
        baseline: { type: 'positional', description: 'Baseline fixtures directory', required: true },
        current: { type: 'positional', description: 'Current fixtures directory', required: true },
        fail: { type: 'boolean', description: 'Exit non-zero on changes' },
      },
      async run({ args }) {
        const baseline = args.baseline as string | undefined;
        const current = args.current as string | undefined;

        if (!baseline || !current) {
          console.error('[smocky] snapshot check requires <baseline> and <current> directories');
          process.exit(1);
        }

        try {
          const report = await compareSnapshots(baseline, current);
          printSnapshotReport(report);

          const hasChanges = report.diffs.some(
            (d) => d.change === 'modified' || d.change === 'removed',
          );

          if (args.fail && hasChanges) {
            process.exit(3);
          }

          process.exit(0);
        } catch (error) {
          console.error(`[smocky] ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      },
    },
    init: {
      meta: { name: 'init', description: 'Scaffold a new Smocky project' },
      args: {
        'from-openapi': {
          type: 'string',
          description: 'Generate endpoints from an OpenAPI spec (URL or file path)',
        },
        header: {
          type: 'string',
          description: 'HTTP header for fetching the OpenAPI spec (repeatable)',
        },
        force: {
          type: 'boolean',
          description: 'Overwrite existing files',
          default: false,
        },
        yes: {
          type: 'boolean',
          description: 'Skip prompts and accept defaults (non-interactive)',
          default: false,
        },
        cwd: {
          type: 'string',
          description: 'Target directory (default: current)',
        },
        name: { type: 'string', description: 'Project name (skips prompt)' },
        port: { type: 'string', description: 'Server port (skips prompt)' },
        examples: { type: 'boolean', description: 'Include example endpoints', default: undefined as unknown as boolean },
        helpers: { type: 'boolean', description: 'Include helpers/ folder', default: undefined as unknown as boolean },
        db: { type: 'boolean', description: 'Include db/ folder', default: undefined as unknown as boolean },
        tsconfig: { type: 'boolean', description: 'Write tsconfig.json', default: undefined as unknown as boolean },
      },
      async run({ args, rawArgs }) {
        const headers = collectRepeated(rawArgs, '--header');
        const code = await runInit({
          fromOpenapi: (args['from-openapi'] as string | undefined) ?? undefined,
          headers,
          force: Boolean(args.force),
          yes: Boolean(args.yes),
          cwd: (args.cwd as string | undefined) ?? process.cwd(),
          name: (args.name as string | undefined) ?? undefined,
          port: args.port ? Number(args.port) : undefined,
          examples: typeof args.examples === 'boolean' ? args.examples : undefined,
          helpers: typeof args.helpers === 'boolean' ? args.helpers : undefined,
          db: typeof args.db === 'boolean' ? args.db : undefined,
          tsconfig: typeof args.tsconfig === 'boolean' ? args.tsconfig : undefined,
        });
        process.exit(code);
      },
    },
  },
  async run({ args }) {
    if (args.version) {
      console.log(await readVersion());
      process.exit(0);
    }
    try {
      const handle = await startServer();
      installSignalHandlers(handle);
      await new Promise<never>(() => {});
    } catch (error) {
      console.error(`[smocky] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
  },
});

await runMain(main);
