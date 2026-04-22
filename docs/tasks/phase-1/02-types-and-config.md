# Task T-1.02: Types & Config Loader

## Status
- [ ] Not started

## Goal
Define the core public TypeScript types (`Config`, `MockRequest`,
`MockResponse`, `Hook`, `Helper`, `Ctx`) and implement the loader that reads
and validates `mock.config.ts` with sensible defaults.

## Context
Foundation for every other Phase 1 module. Types here are exported from the
library (D-020). Config loading powers startup.

## Inputs / Prerequisites
- T-1.01 complete.
- Read: [`architecture/05-hooks.md`](../../architecture/05-hooks.md),
  [`architecture/09-configuration.md`](../../architecture/09-configuration.md),
  [`architecture/10-public-api.md`](../../architecture/10-public-api.md).
- Decisions: D-005, D-006, D-013, D-016–D-019, D-022 (reservation),
  D-026 (reservation).

## Deliverables
- `src/types.ts` — exported public types.
- `src/config.ts` — config loader with `defineConfig()` helper.

## Implementation Notes

### `src/types.ts`
```ts
export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body: unknown;
  raw: Request;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay: number;
}

export interface Ctx {
  req: MockRequest;
  // db?: Db    // populated in Phase 2
}

export type Hook = (
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
) => void | Promise<void>;

export type Helper = (...args: string[]) => unknown | Promise<unknown>;

export interface RecordConfig {
  enabled?: boolean;
  outputDir?: string;
  include?: Array<string | RegExp>;
  exclude?: Array<string | RegExp>;
  overwrite?: boolean;
}

export interface DbConfig {     // Phase 2 reservation
  dir?: string;
  persist?: boolean;
  autoId?: 'uuid';
}

export interface OpenApiConfig { // Phase 3 reservation
  spec: string;
  check?: {
    timeout?: number;
    auth?: { headers?: Record<string, string> };
    skipPaths?: Array<string | RegExp>;
    sampleData?: string;
    failOnMismatch?: boolean;
  };
}

export interface Config {
  port?: number;
  baseUrl?: string;
  endpointsDir?: string;
  helpersDir?: string;
  globalHeaders?: Record<string, string>;
  record?: RecordConfig;
  db?: DbConfig;          // accepted but unused in Phase 1
  openapi?: OpenApiConfig; // accepted but unused in Phase 1
}

export interface ResolvedConfig extends Required<Omit<Config, 'db' | 'openapi'>> {
  db?: DbConfig;
  openapi?: OpenApiConfig;
  record: Required<RecordConfig>;
}
```

### `src/config.ts`
```ts
import type { Config, ResolvedConfig } from './types';
import { resolve } from 'node:path';

export function defineConfig(c: Config): Config { return c; }

const DEFAULTS: ResolvedConfig = {
  port: 3000,
  baseUrl: '',
  endpointsDir: './endpoints',
  helpersDir: './helpers',
  globalHeaders: {},
  record: {
    enabled: false,
    outputDir: './endpoints',
    include: [],
    exclude: [],
    overwrite: false,
  },
};

export async function loadConfig(path?: string): Promise<ResolvedConfig> {
  const cfgPath = resolve(path ?? './mock.config.ts');
  let user: Config = {};
  try {
    user = (await import(cfgPath)).default ?? {};
  } catch (err) {
    // No config file is OK — use defaults
  }
  return mergeConfig(DEFAULTS, user);
}

function mergeConfig(d: ResolvedConfig, u: Config): ResolvedConfig {
  return {
    ...d,
    ...u,
    globalHeaders: { ...d.globalHeaders, ...(u.globalHeaders ?? {}) },
    record: { ...d.record, ...(u.record ?? {}) },
    db: u.db,
    openapi: u.openapi,
  };
}
```

### Environment Overrides
Apply env var overrides after merge:

```ts
if (process.env.PORT) cfg.port = Number(process.env.PORT);
if (process.env.BASE_URL) cfg.baseUrl = process.env.BASE_URL;
if (process.env.RECORD === '1' || process.env.RECORD === 'true') {
  cfg.record.enabled = true;
}
```

## Acceptance Criteria
- [ ] All types compile under `strict: true`.
- [ ] `loadConfig()` returns sensible defaults when no file exists.
- [ ] User config keys deep-merge with defaults; arrays replace, not concat.
- [ ] Env overrides applied after file merge.
- [ ] `defineConfig` is identity but provides full TS inference.
- [ ] `db` and `openapi` fields accepted without error (warning log OK).

## Out of Scope
- Server bootstrap (T-1.10).
- Hook/template integration (T-1.04, T-1.06, T-1.07).

## References
- D-005, D-006, D-013, D-016, D-017, D-018, D-019
- [`architecture/09-configuration.md`](../../architecture/09-configuration.md)
