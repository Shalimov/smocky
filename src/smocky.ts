import { join, resolve } from 'node:path';

import { loadConfig, loadConfigDefaults } from './config';
import { createDb } from './db';
import { loadSeeds } from './db-loader';
import { createDbPersister } from './db-persist';
import { loadHelpers } from './helpers-loader';
import { createProxy } from './proxy';
import { createRecorder } from './recorder';
import { buildMockRequest, createResponder } from './responder';
import { createEmptyRouter, scanRoutes, type Router } from './router';
import { createEngine, type Engine } from './template';
import { normalizeHeaders } from './utils';
import type { ResolvedConfig, SmockyOptions } from './types';

const WORKSPACE_SOURCE_PRIORITY = 10;
const COMMON_SOURCE_PRIORITY = 0;

export { createEmptyRouter, scanRoutes } from './router';

export interface SmockyHandle {
  port: number;
  url: string;
  stop(): Promise<void>;
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
}

export class Smocky {
  private runtime: RuntimeState | null = null;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private _port = 0;
  private _url = '';

  static async start(opts: SmockyOptions = {}): Promise<Smocky> {
    const instance = new Smocky();
    const config = await resolveSmockyConfig(opts);

    instance.runtime = await buildRuntime(config);

    const server = Bun.serve({
      port: instance.runtime.cfg.port,
      fetch: async (raw: Request): Promise<Response> => {
        const rt = instance.runtime;
        if (!rt) {
          return new Response(JSON.stringify({ error: 'ServerStopped' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (raw.method.toUpperCase() === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: rt.cfg.globalHeaders,
          });
        }

        const url = new URL(raw.url);
        const match = rt.router.match(raw.method, url.pathname);
        if (match) {
          const req = await buildMockRequest(raw, match.params);
          return rt.responder.respond(match, req);
        }

        if (!rt.cfg.baseUrl) {
          return notFoundResponse(url.pathname);
        }

        const upstream = await rt.proxy.forward(raw.clone());
        rt.recorder.record(raw, upstream.clone()).catch((error) => {
          console.warn(`[smocky] recorder error: ${error instanceof Error ? error.message : String(error)}`);
        });
        return upstream;
      },
    });

    instance.server = server;
    instance._port = server.port ?? instance.runtime.cfg.port;
    instance._url = `http://localhost:${instance._port}`;

    logStartup(instance.runtime, instance._port);

    return instance;
  }

  get port(): number {
    return this._port;
  }

  get url(): string {
    return this._url;
  }

  async stop(): Promise<void> {
    if (this.runtime) {
      await this.runtime.db.flush();
    }
    if (this.server) {
      this.server.stop(true);
      this.server = null;
    }
    this.runtime = null;
  }
}

async function resolveSmockyConfig(opts: SmockyOptions): Promise<ResolvedConfig> {
  const cwd = process.cwd();

  const hasExplicitDirs = opts.endpointsDir !== undefined || opts.helpersDir !== undefined;
  let config: ResolvedConfig;

  if (opts.config) {
    config = await loadConfig(opts.config);
  } else if (hasExplicitDirs) {
    config = await loadConfigDefaults();
  } else {
    config = await loadConfig();
  }

  if (opts.port !== undefined) {
    config.port = opts.port;
  }
  if (opts.baseUrl !== undefined) {
    config.baseUrl = opts.baseUrl;
  }
  if (opts.endpointsDir !== undefined) {
    config.endpointsDir = resolve(cwd, opts.endpointsDir);
  }
  if (opts.helpersDir !== undefined) {
    config.helpersDir = resolve(cwd, opts.helpersDir);
  }
  if (opts.globalHeaders) {
    config.globalHeaders = {
      ...config.globalHeaders,
      ...normalizeHeaders(opts.globalHeaders),
    };
  }
  if (opts.workspace !== undefined) {
    config.workspace = opts.workspace;
    config.workspaces = undefined;
  }
  if (opts.workspaces !== undefined) {
    config.workspaces = opts.workspaces;
    config.workspace = undefined;
  }
  if (opts.db !== undefined) {
    config.db = { ...config.db, ...opts.db };
  }
  if (opts.record !== undefined) {
    config.record = { ...config.record, ...opts.record };
  }

  // Allow port 0 (random port) for test usage
  if (config.port === 0) {
    // Bun.serve will assign a random free port
  } else if (!Number.isInteger(config.port) || config.port <= 0) {
    throw new Error(`[smocky] invalid port: ${String(config.port)}`);
  }

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error(`[smocky] invalid baseUrl: ${config.baseUrl}`);
    }
  }

  return config;
}

async function buildRuntime(cfg: ResolvedConfig): Promise<RuntimeState> {
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

  const helpers = await loadHelpers(cfg.helpersDir);
  const engine = createEngine(helpers);

  const router = createEmptyRouter();

  const hasWorkspaces = cfg.workspace || (cfg.workspaces && cfg.workspaces.length > 0);

  if (hasWorkspaces) {
    const commonDir = join(cfg.endpointsDir, 'common');
    const commonRoutes = await scanRoutes(commonDir);
    if (commonRoutes.length > 0) {
      router.addSource(commonRoutes, COMMON_SOURCE_PRIORITY);
    }

    const wsNames = cfg.workspaces ?? [cfg.workspace!];
    for (const wsName of wsNames) {
      const wsDir = join(cfg.endpointsDir, wsName);
      const wsRoutes = await scanRoutes(wsDir);
      if (wsRoutes.length > 0) {
        router.addSource(wsRoutes, WORKSPACE_SOURCE_PRIORITY);
      }
    }
  } else {
    const routes = await scanRoutes(cfg.endpointsDir);
    if (routes.length > 0) {
      router.addSource(routes, COMMON_SOURCE_PRIORITY);
    }
  }

  return {
    cfg,
    router,
    engine,
    responder: createResponder(cfg, engine, db),
    proxy: createProxy(cfg.baseUrl),
    recorder: createRecorder(cfg.record),
    db,
    helperNames: [...helpers.keys()].sort(),
  };
}

function logStartup(runtime: RuntimeState, port: number): void {
  const routes = runtime.router.routes();
  const staticRoutes = routes.filter((route) => route.paramNames.length === 0).length;
  const dynamicRoutes = routes.length - staticRoutes;

  const mode = runtime.cfg.workspace ?? runtime.cfg.workspaces;
  const workspaceInfo = mode
    ? ` (workspace: ${typeof mode === 'string' ? mode : mode.join(', ')})`
    : '';

  const msg = [
    `[smocky]`,
    `  port:      ${port}`,
    `  baseUrl:   ${runtime.cfg.baseUrl || '(disabled)'}`,
    `  endpoints: ${routes.length} routes (${staticRoutes} static, ${dynamicRoutes} dynamic)${workspaceInfo}`,
    `  helpers:   ${runtime.helperNames.length ? runtime.helperNames.join(', ') : '(none)'}`,
    `  record:    ${runtime.cfg.record.enabled ? 'enabled' : 'disabled'}`,
  ];

  console.log(msg.join('\n'));
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


