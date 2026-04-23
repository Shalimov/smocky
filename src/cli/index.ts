#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty';

import { runCli } from '../index';
import { runInit } from './commands/init';

const main = defineCommand({
  meta: {
    name: 'smocker',
    description: 'Convention-over-configuration mock server for Bun.',
  },
  subCommands: {
    serve: defineCommand({
      meta: { name: 'serve', description: 'Start the mock server' },
      args: {
        config: { type: 'string', description: 'Path to smocker.config.ts' },
        port: { type: 'string', description: 'Override port' },
        'base-url': { type: 'string', description: 'Override baseUrl' },
        record: { type: 'boolean', description: 'Enable recorder', default: false },
      },
      async run({ args }) {
        const argv = ['serve'];
        if (args.config) argv.push('--config', String(args.config));
        if (args.port) argv.push('--port', String(args.port));
        if (args['base-url']) argv.push('--base-url', String(args['base-url']));
        if (args.record) argv.push('--record');
        const code = await runCli(argv);
        if (typeof code === 'number') process.exit(code);
        // Server started; keep the event loop alive forever so SIGINT/SIGTERM
        // handlers (installed in runCli) can shut it down cleanly.
        await new Promise<never>(() => {});
      },
    }),
    check: defineCommand({
      meta: { name: 'check', description: 'Validate spec against API and/or local mocks' },
      args: {
        target: { type: 'positional', description: 'api | mocks | all', required: false },
        config: { type: 'string', description: 'Path to smocker.config.ts' },
        port: { type: 'string', description: 'Override port' },
        'base-url': { type: 'string', description: 'Override baseUrl' },
        fail: { type: 'boolean', description: 'Exit non-zero on mismatch', default: false },
      },
      async run({ args }) {
        const argv = ['check'];
        const target = (args.target as string | undefined) ?? 'all';
        if (!['api', 'mocks', 'all'].includes(target)) {
          console.error(`[smocker] unknown check target: ${target}`);
          process.exit(1);
        }
        argv.push(target);
        if (args.config) argv.push('--config', String(args.config));
        if (args.port) argv.push('--port', String(args.port));
        if (args['base-url']) argv.push('--base-url', String(args['base-url']));
        if (args.fail) argv.push('--fail');
        const code = await runCli(argv);
        if (typeof code === 'number') process.exit(code);
      },
    }),
    init: defineCommand({
      meta: { name: 'init', description: 'Scaffold a new Smocker project' },
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
    }),
  },
  async run() {
    // No subcommand: behave like the old default (start server).
    const code = await runCli(process.argv.slice(2));
    if (typeof code === 'number') process.exit(code);
  },
});

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

await runMain(main);
