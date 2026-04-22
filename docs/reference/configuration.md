# Configuration

Smocker is configured via a single TypeScript file at the project root:
`mock.config.ts`. TypeScript was chosen over JSON for type safety,
auto-completion, and the ability to embed RegExps and inline functions.

## Minimum Viable Config

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  baseUrl: 'https://api.example.com',
});
```

Everything else has sensible defaults.

## Full Schema

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://api.example.com',
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

  db: {
    dir: './db',
    persist: false,
    autoId: 'uuid',
  },

  openapi: {
    spec: './openapi.json',
    check: {
      timeout: 5000,
      auth: { headers: { Authorization: 'Bearer xyz' } },
      skipPaths: ['/internal/'],
      sampleData: './openapi-samples.json',
      failOnMismatch: false,
    },
  },
});
```

## Field Reference

### `port` *(number, default `3000`)*

Port `Bun.serve` binds to. Override via the `PORT` env var or the `--port`
CLI flag.

### `baseUrl` *(string, optional)*

Upstream API for the proxy and recorder. If omitted, unmatched routes
return `404` instead of being proxied. See
[Proxy and Recorder](../features/proxy-and-recorder.md).

### `endpointsDir` *(string, default `./endpoints`)*

Folder scanned at startup to build the route table. See
[Routing](../features/routing.md).

### `helpersDir` *(string, default `./helpers`)*

Folder scanned for template helpers. See [Helpers](../features/helpers.md).

### `globalHeaders` *(object, default `{}`)*

Headers merged into **every mocked response**. Per-response headers take
precedence. Designed primarily for CORS, but useful for any cross-cutting
header. Proxied responses are unaffected.

These headers are also returned on auto-handled `OPTIONS` preflight
requests (Smocker replies with `204` and `globalHeaders`).

### `record` *(object)*

Recorder configuration. See [Proxy and Recorder](../features/proxy-and-recorder.md#recorder)
for the complete table.

| Field       | Type                          | Default          |
|-------------|-------------------------------|------------------|
| `enabled`   | `boolean`                     | `false`          |
| `outputDir` | `string`                      | `endpointsDir`   |
| `include`   | `(string \| RegExp)[]`        | `[]`             |
| `exclude`   | `(string \| RegExp)[]`        | `[]`             |
| `overwrite` | `boolean`                     | `false`          |

### `db` *(object)*

In-memory database. See [Database](../features/database.md).

| Field     | Type                | Default    |
|-----------|---------------------|------------|
| `dir`     | `string`            | `./db`     |
| `persist` | `boolean`           | `false`    |
| `autoId`  | `'uuid'`            | `'uuid'`   |

### `openapi` *(object, optional)*

OpenAPI checker configuration. See
[OpenAPI Checker](../features/openapi-checker.md).

```ts
interface OpenApiConfig {
  spec: string;
  check?: {
    timeout?: number;                       // default 5000ms
    auth?: { headers?: Record<string, string> };
    skipPaths?: Array<string | RegExp>;
    sampleData?: string;
    failOnMismatch?: boolean;               // default false
  };
}
```

## Loading Order

1. Resolve `mock.config.ts` from cwd (or the path given to `--config`).
2. Dynamically import via Bun.
3. Merge with defaults (deep merge for objects, replacement for arrays).
4. Apply env-var overrides.
5. Apply CLI-flag overrides.
6. Freeze and pass to all subsystems.

**Precedence** (highest first): CLI flags → env vars → config file → defaults.

## Environment Variables

| Variable     | Maps to            |
|--------------|--------------------|
| `PORT`       | `port`             |
| `BASE_URL`   | `baseUrl`          |
| `RECORD`     | `record.enabled` (truthy: `1`, `true`) |

## CLI Flags That Override Config

| Flag                | Maps to            |
|---------------------|--------------------|
| `--port <n>`        | `port`             |
| `--base-url <url>`  | `baseUrl`          |
| `--record`          | `record.enabled`   |
| `--config <path>`   | Config file path   |

See [API Reference](api.md) for the full CLI surface.
