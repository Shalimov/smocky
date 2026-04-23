# Changelog

All notable changes to Smocker are listed here. The project follows
[Semantic Versioning](https://semver.org/) once it reaches `1.0.0`. Until
then, minor versions may include breaking changes.

## [Unreleased]

## [0.1.0] — 2026-04-23

First public, installable release.

### Added
- `smocker init` — interactive scaffolder that writes
  `smocker.config.ts`, example endpoints (`health`, `users`,
  `users/_id`), an optional `helpers/guid.ts`, optional `db/users.json`
  seed, and optional `tsconfig.json`. Non-interactive mode via `--yes`
  and per-feature flags (`--examples/--no-examples`, `--helpers`,
  `--db`, `--tsconfig`, `--name`, `--port`, `--cwd`, `--force`).
- `smocker init --from-openapi <spec>` — generate one
  `endpoints/<path>/response.json` per OpenAPI operation.
  - Accepts a local file path or `http(s)://` URL.
  - Auth via repeatable `--header "Name: value"`.
  - Resolves `$ref`s through `@apidevtools/json-schema-ref-parser`.
  - Body strategy: examples first, `json-schema-faker` fallback,
    graceful empty body for unsupported content types.
  - Idempotent: on re-run, missing methods are merged into existing
    `response.json` files; existing methods are preserved unless
    `--force` is passed.
  - Tag- and operation-level multi-select prompts, or "all" in
    `--yes`/non-TTY mode.
- Citty-based CLI in `src/cli/` with `serve`, `check`, and `init`
  subcommands. `serve` and `check` delegate to the existing parser to
  preserve behavior and tested error messages.
- `LICENSE` (MIT) and `CHANGELOG.md`.
- `package.json` is now installable: bumped to `0.1.0`, declares
  `engines.bun >= 1.1`, ships `src/`, `templates/`, `LICENSE`, and
  `README.md`, and exposes a `smocker` bin.
- Project scaffolds available under `templates/` so installs from
  GitHub include them.

### Changed
- Default config file renamed from `mock.config.ts` to
  `smocker.config.ts`. The old name is still loaded with a one-time
  deprecation warning at startup.
- `bin` entry repointed to the new Citty CLI (`./src/cli/index.ts`).
- README and `docs/getting-started.md` lead with `smocker init` and
  install from `github:YOUR_USER/smocker#v0.1.0`.

### Compatibility
- Public exports unchanged: `defineConfig`, `startServer`, `runCli`,
  and the type surface (`Hook`, `MockConfig`, etc.) remain
  source-compatible.
- Bun-only for v0.1; Node distribution is intentionally deferred.

## [0.0.0]
- Initial development snapshot (pre-distribution).
