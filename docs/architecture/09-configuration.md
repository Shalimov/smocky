# 09 — Configuration

Smocker is configured via a single TypeScript file at the project root:
`mock.config.ts` (D-018). TypeScript was chosen over JSON for type safety,
auto-completion, and the ability to express RegExps and inline functions.

## Full Schema (Phase 1)

```ts
export interface Config {
  /** Port to listen on. Default: 3000 */
  port?: number;

  /** Upstream base URL for proxy fallback. Required if any proxying is desired. */
  baseUrl?: string;

  /** Endpoint folder. Default: './endpoints' */
  endpointsDir?: string;

  /** Helper folder. Default: './helpers' */
  helpersDir?: string;

  /** Headers merged into every mocked response. Default: {} */
  globalHeaders?: Record<string, string>;

  /** Recorder configuration. */
  record?: {
    enabled?: boolean;                       // default false
    outputDir?: string;                      // default endpointsDir
    include?: Array<string | RegExp>;        // default []
    exclude?: Array<string | RegExp>;        // default []
    overwrite?: boolean;                     // default false
  };

  // Reserved for future phases (no-op in Phase 1)
  db?: DbConfig;          // Phase 2
  openapi?: OpenApiConfig;// Phase 3
}

export default function defineConfig(c: Config): Config { return c; }
```

## Default `mock.config.ts`

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://api.production.com',
  endpointsDir: './endpoints',
  helpersDir: './helpers',
  globalHeaders: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Allow-Headers': '*',
  },
  record: {
    enabled: false,
    outputDir: './endpoints',
    include: [],
    exclude: [],
    overwrite: false,
  },
});
```

## Field Reference

### `port` (number, default `3000`)
Port `Bun.serve` binds to. Override via `PORT` env var (CLI flag overrides
both — see [`10-public-api.md`](10-public-api.md)).

### `baseUrl` (string, optional)
Upstream API for proxy + recorder. If omitted, unmatched routes return
`404` instead of proxying.

### `endpointsDir` / `helpersDir` (strings)
Resolved relative to the project root (cwd at startup). May be absolute.

### `globalHeaders` (D-019)
Merged into every **mocked** response. Per-response headers take precedence.
Designed primarily for CORS but useful for any cross-cutting headers.
Proxied responses are unaffected.

### `record` (D-016, D-017)
| Field       | Type                          | Default          | Notes                                     |
|-------------|-------------------------------|------------------|-------------------------------------------|
| enabled     | boolean                       | false            | Master switch                             |
| outputDir   | string                        | endpointsDir     | Where recorded stubs are written          |
| include     | (string \| RegExp)[]          | []               | Allow-list; if non-empty, must match      |
| exclude     | (string \| RegExp)[]          | []               | Deny-list; checked first                  |
| overwrite   | boolean                       | false            | Replace existing method blocks            |

Strings match by prefix; RegExps match the full path.

### `db` (Phase 2 — D-022)

```ts
interface DbConfig {
  dir?: string;            // default './db'
  persist?: boolean;       // default false
  autoId?: 'uuid';         // default 'uuid' (D-023)
}
```

In Phase 1 the field is accepted but unused; emitting a warning helps users
realize it isn't wired yet.

### `openapi` (Phase 3 — D-026)

```ts
interface OpenApiConfig {
  spec: string;            // path or URL to openapi.json/yaml
  check?: {
    timeout?: number;                       // default 5000ms
    auth?: { headers?: Record<string, string> };
    skipPaths?: Array<string | RegExp>;
    sampleData?: string;                    // path to override file
    failOnMismatch?: boolean;               // default false (D-031)
  };
}
```

In Phase 1 the field is accepted but unused.

## Loading Algorithm

1. Resolve `mock.config.ts` from cwd.
2. Dynamically import via Bun.
3. Merge with defaults (deep merge for objects, replacement for arrays).
4. Validate (required keys when features are used; informative errors).
5. Freeze and pass to all subsystems.

## Environment Variable Overrides

| Variable        | Maps to        |
|-----------------|----------------|
| `PORT`          | `port`         |
| `BASE_URL`      | `baseUrl`      |
| `RECORD`        | `record.enabled` (truthy values: `1`, `true`) |

CLI flags > env vars > config file > defaults.

## References

- D-016, D-017, D-018, D-019, D-022, D-023, D-026, D-031
- [`08-proxy-and-recorder.md`](08-proxy-and-recorder.md), [`10-public-api.md`](10-public-api.md)
