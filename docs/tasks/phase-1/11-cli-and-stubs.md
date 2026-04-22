# Task T-1.11: CLI & Subcommand Stubs

## Status
- [x] Complete (2026-04-22)

## Goal
Parse CLI arguments, dispatch to `serve` or stub `check` subcommands, and
support standard global flags (`--config`, `--port`, `--base-url`,
`--record`, `--help`, `--version`).

## Context
Solidifies the CLI surface defined in `architecture/10-public-api.md`. The
`check` subcommand is reserved here so Phase 3 ships non-breaking (D-033).

## Inputs / Prerequisites
- T-1.10 complete.
- Read: [`architecture/10-public-api.md`](../../architecture/10-public-api.md).
- Decisions: D-020, D-033.

## Deliverables
- `src/cli.ts` (or inline within `src/index.ts`)

## Implementation Notes

### Argument Parsing
A minimal hand-rolled parser is sufficient — no need for a dependency.

```ts
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

function parse(argv: string[]): CliArgs {
  // first positional → command (default 'serve')
  // second positional → subcommand (only for 'check')
  // flags: --config <path>, --port <n>, --base-url <url>, --record, --fail, --help, --version
}
```

### Dispatch
```ts
export async function runCli(argv: string[]) {
  const args = parse(argv);
  if (args.help)    return printHelp();
  if (args.version) return printVersion();

  switch (args.command) {
    case 'serve': return await serve(args);
    case 'check': return await check(args);
  }
}

async function check(args: CliArgs) {
  console.log(
    '[smocker] OpenAPI checker is planned for Phase 3 and not yet implemented.\n' +
    '          See docs/architecture/12-openapi-checker.md',
  );
  process.exit(0);
}
```

### Help Text
```
smocker — convention-over-configuration mock server

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
  -v, --version                   Show version
```

### Exit Codes
| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | Normal exit                                      |
| 1    | Configuration error                              |
| 2    | Runtime error (port in use, etc.)                |
| 3    | Reserved for Phase 3 `check --fail` mismatches   |

## Acceptance Criteria
- [ ] `smocker` (no args) starts the server.
- [ ] `smocker serve --port 4000` overrides port.
- [ ] `smocker --record` toggles recording.
- [ ] `smocker check api` prints stub notice and exits 0.
- [ ] `smocker --help` prints usage.
- [ ] `smocker --version` prints package version.

## Out of Scope
- Real `check` implementation (Phase 3).

## References
- D-020, D-033
- [`architecture/10-public-api.md`](../../architecture/10-public-api.md)
