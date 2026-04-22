#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runApiChecker } from './checker/api-checker';
import { runMockChecker } from './checker/mock-checker';
import { createReport, printReport } from './checker/reporter';
import { loadSampleOverrides } from './checker/sample-generator';
import { loadSpec } from './checker/spec-loader';
import { createDb } from './db';
import { loadSeeds } from './db-loader';
import { createDbPersister } from './db-persist';
import { clearHookCache } from './hook-runner';
import { loadHelpers } from './helpers-loader';
import { createProxy } from './proxy';
import { createRecorder } from './recorder';
import { buildMockRequest, createResponder } from './responder';
import { buildRouter, type Router } from './router';
import { createEngine, type Engine } from './template';
import { defineConfig, loadConfig } from './config';
import type {
  Config,
  Ctx,
  Helper,
  Hook,
  MockRequest,
  MockResponse,
  ResolvedConfig,
} from './types';

export { defineConfig } from './config';
export type { Config, Ctx, Helper, Hook, MockRequest, MockResponse } from './types';

export interface ServerHandle {
  port: number;
  url: string;
  stop(): Promise<void>;
  reload(): Promise<void>;
}

export interface StartOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean;
}

interface RuntimeState {
  cfg: ResolvedConfig;
  router: Router;
  engine: Engine;
  responder: ReturnType<typeof createResponder>;
  proxy: ReturnType<typeof createProxy>;
  recorder: ReturnType<typeof createRecorder>;
  db: ReturnType<typeof createDb>;
  helperNames: string[];
  reloadToken: number;
}

export async function startServer(opts: StartOptions = {}): Promise<ServerHandle> {
  const baseConfig = applyStartOptions(await loadConfig(opts.config), opts);
  let runtime = await buildRuntime(baseConfig, 0);

  const server = Bun.serve({
    port: runtime.cfg.port,
    fetch: async (raw: Request): Promise<Response> => {
      if (raw.method.toUpperCase() === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: runtime.cfg.globalHeaders,
        });
      }

      const url = new URL(raw.url);
      const match = runtime.router.match(raw.method, url.pathname);
      if (match) {
        const req = await buildMockRequest(raw, match.params);
        return runtime.responder.respond(match, req);
      }

      if (!runtime.cfg.baseUrl) {
        return notFoundResponse(url.pathname);
      }

      const upstream = await runtime.proxy.forward(raw.clone());
      runtime.recorder.record(raw, upstream.clone()).catch((error) => {
        console.warn(`[smocker] recorder error: ${error instanceof Error ? error.message : String(error)}`);
      });
      return upstream;
    },
  });

  const port = server.port ?? runtime.cfg.port;
  logStartup(runtime, port);

  return {
    port,
    url: `http://localhost:${port}`,
    async stop(): Promise<void> {
      await runtime.db.flush();
      server.stop(true);
    },
    async reload(): Promise<void> {
      runtime = await buildRuntime(runtime.cfg, runtime.reloadToken + 1);
      console.log('[smocker] runtime reloaded');
    },
  };
}

async function buildRuntime(cfg: ResolvedConfig, reloadToken: number): Promise<RuntimeState> {
  const persister = cfg.db.persist
    ? createDbPersister({ dir: cfg.db.dir, debounceMs: 100 })
    : null;
  const db = createDb({
    autoId: cfg.db.autoId,
    onMutation: persister
      ? (name, items) => {
          persister.schedule(name, items);
        }
      : undefined,
    onFlush: persister ? () => persister.flush() : undefined,
  });
  await loadSeeds(db, cfg.db.dir);

  const helpers = await loadHelpers(cfg.helpersDir, { cacheBust: String(reloadToken) });
  const engine = createEngine(helpers);
  const router = await buildRouter(cfg.endpointsDir);
  clearHookCache();

  return {
    cfg,
    router,
    engine,
    responder: createResponder(cfg, engine, db),
    proxy: createProxy(cfg.baseUrl),
    recorder: createRecorder(cfg.record),
    db,
    helperNames: [...helpers.keys()].sort(),
    reloadToken,
  };
}

function applyStartOptions(config: ResolvedConfig, opts: StartOptions): ResolvedConfig {
  const next: ResolvedConfig = {
    ...config,
    record: {
      ...config.record,
    },
  };

  if (opts.port !== undefined) {
    next.port = opts.port;
  }
  if (opts.baseUrl !== undefined) {
    next.baseUrl = opts.baseUrl;
  }
  if (opts.record) {
    next.record.enabled = true;
  }

  return next;
}

function logStartup(runtime: RuntimeState, port: number): void {
  const routes = runtime.router.routes();
  const staticRoutes = routes.filter((route) => route.paramNames.length === 0).length;
  const dynamicRoutes = routes.length - staticRoutes;

  console.log('[smocker]');
  console.log(`  port:      ${port}`);
  console.log(`  baseUrl:   ${runtime.cfg.baseUrl || '(disabled)'}`);
  console.log(`  endpoints: ${routes.length} routes (${staticRoutes} static, ${dynamicRoutes} dynamic)`);
  console.log(`  helpers:   ${runtime.helperNames.length ? runtime.helperNames.join(', ') : '(none)'}`);
  console.log(`  record:    ${runtime.cfg.record.enabled ? 'enabled' : 'disabled'}`);
}

function notFoundResponse(pathname: string): Response {
  return new Response(
    JSON.stringify({
      error: 'NotFound',
      message: `No mock matched ${pathname} and baseUrl is not configured.`,
    }),
    {
      status: 404,
      headers: { 'content-type': 'application/json' },
    },
  );
}

interface CliArgs {
  command: 'serve' | 'check';
  subcommand?: 'api' | 'mocks' | 'all';
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean;
  fail?: boolean;
  help?: boolean;
  version?: boolean;
}

export async function runCli(argv: string[]): Promise<number | undefined> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    console.error(`[smocker] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (args.help) {
    printHelp();
    return 0;
  }
  if (args.version) {
    console.log(await readVersion());
    return 0;
  }

  if (args.command === 'check') {
    try {
      return await runCheckCommand(args);
    } catch (error) {
      console.error(`[smocker] ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  try {
    const handle = await startServer({
      config: args.config,
      port: args.port,
      baseUrl: args.baseUrl,
      record: args.record,
    });

    installSignalHandlers(handle);
    return undefined;
  } catch (error) {
    console.error(`[smocker] ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

function parseCliArgs(argv: string[]): CliArgs {
  const positionals: string[] = [];
  const args: CliArgs = { command: 'serve' };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    switch (token) {
      case '--config':
        args.config = readFlagValue(argv, ++index, token);
        break;
      case '--port':
        args.port = Number(readFlagValue(argv, ++index, token));
        break;
      case '--base-url':
        args.baseUrl = readFlagValue(argv, ++index, token);
        break;
      case '--record':
        args.record = true;
        break;
      case '--fail':
        args.fail = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`unknown flag: ${token}`);
        }
        positionals.push(token);
        break;
    }
  }

  const [command, subcommand] = positionals;
  if (command === 'serve' || command === undefined) {
    args.command = 'serve';
  } else if (command === 'check') {
    args.command = 'check';
    if (subcommand === 'api' || subcommand === 'mocks' || subcommand === 'all' || subcommand === undefined) {
      args.subcommand = subcommand ?? 'all';
    } else {
      throw new Error(`unknown check target: ${subcommand}`);
    }
  } else {
    throw new Error(`unknown command: ${command}`);
  }

  return args;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`missing value for ${flag}`);
  }
  return value;
}

function printHelp(): void {
  console.log(`smocker - convention-over-configuration mock server

Usage:
  smocker [serve]                 Start the mock server
  smocker check api               (Phase 3) Validate spec against real API
  smocker check mocks             (Phase 3) Validate spec against local mocks
  smocker check all               (Phase 3) Both

Options:
  --config <path>                 Path to mock.config.ts (default ./mock.config.ts)
  --port <n>                      Override port
  --base-url <url>                Override baseUrl
  --record                        Enable recorder
  --fail                          (check) Exit non-zero on mismatch
  -h, --help                      Show help
  -v, --version                   Show version`);
}

async function runCheckCommand(args: CliArgs): Promise<number> {
  const config = applyStartOptions(await loadConfig(args.config), {
    config: args.config,
    port: args.port,
    baseUrl: args.baseUrl,
    record: args.record,
  });
  if (!config.openapi?.spec) {
    console.error('[smocker] openapi.spec is not configured in mock.config.ts');
    return 1;
  }

  const spec = await loadSpec(config.openapi.spec);
  const overrides = await loadSampleOverrides(config.openapi.check.sampleData);
  const report = createReport();

  if (args.subcommand === 'api' || args.subcommand === 'all') {
    await runApiChecker(spec, config, overrides, report);
  }

  if (args.subcommand === 'mocks' || args.subcommand === 'all') {
    const router = await buildRouter(config.endpointsDir);
    const helpers = await loadHelpers(config.helpersDir, { cacheBust: 'check' });
    const engine = createEngine(helpers);
    const db = createDb({ autoId: config.db.autoId });
    await loadSeeds(db, config.db.dir);
    await runMockChecker(spec, router, engine, config, overrides, report, db);
  }

  printReport(report);

  const failOnMismatch = args.fail || config.openapi.check.failOnMismatch;
  if (failOnMismatch && report.totals.mismatches > 0) {
    return 3;
  }

  return 0;
}

async function readVersion(): Promise<string> {
  const packageJsonPath = resolve(import.meta.dir, '../package.json');
  const raw = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? '0.0.0';
}

let signalsInstalled = false;

function installSignalHandlers(handle: ServerHandle): void {
  if (signalsInstalled) {
    return;
  }

  const shutdown = async () => {
    await handle.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  signalsInstalled = true;
}

if (import.meta.main) {
  const code = await runCli(process.argv.slice(2));
  if (typeof code === 'number') {
    process.exit(code);
  }
}
