# 10 — Public API

Smocker is distributed as **both** a runnable CLI and an importable library
(D-020). This document defines the surface of each.

## CLI

The package's `bin` field exposes the `smocker` command.

```
smocker <command> [options]

Commands:
  serve              Start the mock server (default)
  check api          [Phase 3] Validate spec against real API
  check mocks        [Phase 3] Validate spec against local mocks
  check all          [Phase 3] Both api + mocks

Global options:
  --config <path>    Path to mock.config.ts (default: ./mock.config.ts)
  --port <n>         Override port
  --base-url <url>   Override baseUrl
  --record           Enable recorder for this run
  --help, -h         Show help
  --version, -v      Show version
```

### Exit Codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | Normal exit (Ctrl-C from `serve`, success otherwise) |
| 1    | Configuration error                              |
| 2    | Runtime error (e.g., port in use)                |
| 3    | `check` found mismatches and `--fail` is set     |

### `check`

`smocker check` is implemented in Phase 3 and supports:

- `smocker check api`
- `smocker check mocks`
- `smocker check all`

`--base-url` overrides the configured upstream for check commands the same way
it does for `serve`.

## Library

```ts
// Importable from 'smocker'
export { defineConfig } from './config';
export { startServer } from './index';
export type {
  Config,
  Hook,
  Helper,
  MockRequest,
  MockResponse,
  Ctx,
} from './types';
```

### `startServer(options?)`

```ts
import { startServer } from 'smocker';

const server = await startServer({
  config: './path/to/mock.config.ts',  // optional
  port: 4000,                          // optional override
});

// later
await server.stop();
```

Returns a handle:

```ts
interface ServerHandle {
  port: number;
  url: string;                         // e.g., http://localhost:4000
  stop: () => Promise<void>;
  reload: () => Promise<void>;         // re-scan endpoints/helpers
}
```

### `defineConfig`

A thin identity helper that gives full TypeScript inference inside
`mock.config.ts`:

```ts
import { defineConfig } from 'smocker';

export default defineConfig({
  port: 3000,
  baseUrl: 'https://api.example.com',
});
```

### Type Exports

`Hook`, `Helper`, `MockRequest`, `MockResponse`, `Ctx` are exposed for users
authoring TypeScript hooks and helpers (see [`05-hooks.md`](05-hooks.md) and
[`06-helpers.md`](06-helpers.md)).

## Programmatic Use Cases

- **Embed inside test runners**: spin up Smocker in `beforeAll`, hit it from
  tests, `stop()` in `afterAll`.
- **Compose with Vite/Next.js dev servers**: run on a different port, point
  the frontend at it.

## Versioning

Smocker follows semver. The CLI surface and the library exports above
constitute the public API; internal modules (`router`, `template`, etc.) are
not stable across minor versions.

## References

- D-020, D-026, D-027, D-031, D-033
- [`09-configuration.md`](09-configuration.md), [`12-openapi-checker.md`](12-openapi-checker.md)
