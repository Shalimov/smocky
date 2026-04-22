# Task T-3.07: CLI Wiring

## Status
- [x] Complete (2026-04-22)

## Goal
Replace the Phase 1 `smocker check` stub with the real implementation,
wiring up `check api`, `check mocks`, `check all`, and the `--fail` flag.

## Context
Closes the loop on D-033 (stub) → D-026, D-027, D-031 (real behavior).

## Inputs / Prerequisites
- T-3.01–T-3.06 complete.
- Read: [`architecture/10-public-api.md`](../../architecture/10-public-api.md),
  [`architecture/12-openapi-checker.md`](../../architecture/12-openapi-checker.md).
- Decisions: D-026, D-027, D-031, D-033.

## Deliverables
- Updates to `src/cli.ts` (or wherever the CLI lives from T-1.11).

## Implementation Notes

```ts
async function check(args: CliArgs) {
  const cfg = await loadConfig(args.config);
  if (!cfg.openapi?.spec) {
    console.error('openapi.spec is not configured in mock.config.ts');
    process.exit(1);
  }

  const spec = await loadSpec(cfg.openapi.spec);
  const router = await buildRouter(cfg.endpointsDir);
  const helpers = await loadHelpers(cfg.helpersDir);
  const engine = createEngine(helpers);

  const report = createReport();

  if (args.subcommand === 'api'   || args.subcommand === 'all') {
    await runApiChecker(spec, cfg, report);
  }
  if (args.subcommand === 'mocks' || args.subcommand === 'all') {
    await runMockChecker(spec, router, engine, cfg, report);
  }

  printReport(report);

  const failOn = args.fail || cfg.openapi.check?.failOnMismatch;
  if (failOn && report.totals.mismatches > 0) process.exit(3);
  process.exit(0);
}
```

### Backwards Compat
Phase 1's stub message is removed; `check` now delegates to the real
implementation. The stub was always temporary (D-033).

## Acceptance Criteria
- [ ] `smocker check api` runs the API checker only.
- [ ] `smocker check mocks` runs the mock checker only.
- [ ] `smocker check all` runs both.
- [ ] `--fail` exits 3 on mismatches; otherwise exits 0.
- [ ] Missing `openapi.spec` config produces a friendly error.

## Out of Scope
- Other subcommands.

## References
- D-026, D-027, D-031, D-033
- [`architecture/10-public-api.md`](../../architecture/10-public-api.md)
