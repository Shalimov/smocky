# API Reference

Smocker ships as both a runnable CLI and an importable library. This page
is the canonical reference for both.

## CLI

The package's `bin` field exposes the `smocker` command. After installing
with `bun add -d github:YOUR_USER/smocker#v0.1.0`, run it with `bun
smocker <command>`. When developing inside this repo, use `bun run
src/cli/index.ts <command>` instead.

```
smocker <command> [options]

Commands:
  serve              Start the mock server (default)
  check api          Validate spec against the real API
  check mocks        Validate spec against local mocks
  check all          Both api + mocks
  init               Scaffold a new project (blank or from OpenAPI)

Global options (serve / check):
  --config <path>    Path to smocker.config.ts (default: ./smocker.config.ts)
  --port <n>         Override port
  --base-url <url>   Override baseUrl (applies to serve and check)
  --record           Enable recorder for this run
  --fail             (check) Exit with code 3 on any mismatch
  -h, --help         Show help
  -v, --version      Show version

init options:
  --from-openapi <spec>      Generate endpoints from a local file or URL
  --header "Name: value"     (repeatable) headers for fetching the spec
  --yes                      Skip prompts; use defaults / passed flags
  --name <s>                 Project name baked into example responses
  --port <n>                 Port baked into smocker.config.ts (default 3000)
  --examples / --no-examples Toggle the example endpoints (default on)
  --helpers  / --no-helpers  Toggle helpers/guid.ts (default on)
  --db       / --no-db       Toggle db/users.json (default off)
  --tsconfig / --no-tsconfig Toggle root tsconfig.json (default off)
  --cwd <dir>                Target directory (default ".")
  --force                    Overwrite existing files instead of skipping
```

If no command is provided, `serve` is assumed. If `check` is provided
without a subcommand, `all` is assumed. See [`smocker init`](../features/init.md)
for the full scaffolder reference.

### Exit Codes

| Code | Meaning                                                     |
|------|-------------------------------------------------------------|
| 0    | Normal exit (Ctrl-C from `serve`, success from `check`)     |
| 1    | Configuration error (bad config, missing `openapi.spec`, …) |
| 2    | Runtime error (e.g., port in use)                           |
| 3    | `check` found mismatches and `--fail` is set                |

### Examples

```bash
# Scaffold a brand-new project (interactive)
smocker init

# Scaffold from an OpenAPI spec, no prompts
smocker init --from-openapi ./openapi.yaml --yes

# Start the server with defaults
smocker

# Use a different config and port
smocker --config ./mocks/smocker.config.ts --port 4000

# Record upstream responses while serving
smocker serve --record

# Check mocks against spec; non-zero on drift
smocker check mocks --fail

# Point checker at staging
smocker check api --base-url https://staging.example.com
```

## Library

Smocker is importable from the `smocker` package:

```ts
import {
  startServer,
  defineConfig,
  type Config,
  type Hook,
  type Helper,
  type MockRequest,
  type MockResponse,
  type Ctx,
} from 'smocker';
```

### `startServer(options?)`

Starts the mock server programmatically and returns a handle.

```ts
import { startServer } from 'smocker';

const server = await startServer({
  config: './smocker.config.ts',   // optional; defaults to cwd lookup
  port: 4000,                    // optional override
  baseUrl: 'http://api.local',   // optional override
  record: true,                  // optional override
});

console.log(server.url);         // http://localhost:4000

await server.stop();
```

#### `StartOptions`

```ts
interface StartOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean;
}
```

#### `ServerHandle`

```ts
interface ServerHandle {
  port: number;
  url: string;                          // e.g. http://localhost:4000
  stop(): Promise<void>;                // flushes the DB before stopping
  reload(): Promise<void>;              // re-scan endpoints + helpers
}
```

`reload()` rebuilds the router, helpers cache, and hook cache without
restarting the HTTP server. Useful when integrated into a watcher.

### `defineConfig(config)`

A thin identity helper that gives full TypeScript inference inside
`smocker.config.ts`:

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://api.example.com',
});
```

See [Configuration](configuration.md) for every available field.

### Type Exports

For authors of TypeScript hooks and helpers:

```ts
type Hook = (
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
) => void | Promise<void>;

type Helper = (...args: string[]) => unknown | Promise<unknown>;
```

```ts
interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;       // lowercased keys
  body: unknown;                         // parsed JSON or undefined
  raw: Request;                          // underlying Bun Request
}

interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay: number;                         // milliseconds, applied before respond
}

interface Ctx {
  req: MockRequest;
  db?: Db;                               // populated when DB is configured
}
```

See [Hooks](../features/hooks.md), [Helpers](../features/helpers.md), and
[Database](../features/database.md) for usage.

## Programmatic Use Cases

### Spin Smocker up inside a test runner

```ts
import { startServer, type ServerHandle } from 'smocker';

let server: ServerHandle;

beforeAll(async () => {
  server = await startServer({ port: 0 }); // 0 = random free port
  process.env.API_BASE = server.url;
});

afterAll(async () => {
  await server.stop();
});
```

### Pair with a Vite/Next.js dev server

Run Smocker on a different port and point the frontend at it via an env
variable. Use `reload()` from a file watcher to pick up new mocks without
restarting.

## Versioning

Smocker follows semver. The CLI surface and the exports listed above
constitute the public API. Internal modules (`router`, `template`,
`responder`, …) are not stable across minor versions.
