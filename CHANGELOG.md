# Changelog

All notable changes to Smocky are listed here. The project follows
[Semantic Versioning](https://semver.org/) once it reaches `1.0.0`. Until
then, minor versions may include breaking changes.

## [Unreleased]

### Security
- Proxy: reject pathnames starting with `//` to prevent SSRF via
  authority-relative URL resolution.
- Proxy: strip `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`,
  and `Forwarded` headers from client requests to prevent IP spoofing.
- Proxy: rewrite `Location` headers on redirects to non-upstream hosts
  (original preserved as `X-Original-Location`) to prevent internal
  URL leakage.
- Recorder: strip `..`, `.`, and `~`-prefixed path segments from recorded
  paths to prevent directory-traversal file writes.
- Responder: clamp `delay` to a maximum of 30 seconds to prevent DoS
  via unbounded sleep.
- Responder: sanitize `\r\n` from all header values to prevent CRLF
  header injection through template-rendered values.
- Template: block `__proto__`, `constructor`, and `prototype` key traversal
  in `readPath` for defense-in-depth.

### Changed
- Router: `match()` now filters routes by HTTP method instead of
  deferring to the responder. This fixes edge cases where a route
  matched the path but had no method block.
- `startServer()` delegates to the `Smocky` class internally, removing
  ~70 lines of duplicated `buildRuntime` logic. CLI `serve` now
  automatically supports workspace/multi-source routing.
- Router: `buildRouter` and `scanRoutes` only swallow `ENOENT` errors;
  permission and other filesystem errors now propagate properly.

### Fixed
- Proxy: handle malformed `req.url` gracefully (returns 502 instead of
  crashing).
- Recorder: catch `res.json()` parse failures, `writeFile` errors, and
  `readFile` errors gracefully instead of propagating unhandled
  rejections.
- DB loader: catch `readFile` errors with a warning instead of aborting
  all seed loading.
- Helpers loader: distinguish `ENOENT` from other `readdir` errors;
  catch `copyFile` and `import()` failures with clear messages.
- Hook runner: catch `copyFile` and `import()` failures with clear
  messages instead of crashing.
- Template: guard against null/undefined `ctx.req` in template
  resolution.

## [0.1.0] — 2026-04-23

First public, installable release.

### Added
- `smocky init` — interactive scaffolder that writes
  `smocky.config.ts`, example endpoints (`health`, `users`,
  `users/_id`), an optional `helpers/guid.ts`, optional `db/users.json`
  seed, and optional `tsconfig.json`. Non-interactive mode via `--yes`
  and per-feature flags (`--examples/--no-examples`, `--helpers`,
  `--db`, `--tsconfig`, `--name`, `--port`, `--cwd`, `--force`).
- `smocky init --from-openapi <spec>` — generate one
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
  `README.md`, and exposes a `smocky` bin.
- Project scaffolds available under `templates/` so installs from
  GitHub include them.

### Changed
- Default config file renamed from `mock.config.ts` to
  `smocky.config.ts`. The old name is still loaded with a one-time
  deprecation warning at startup.
- `bin` entry repointed to the new Citty CLI (`./src/cli/index.ts`).
- README and `docs/getting-started.md` lead with `smocky init` and
  install from `github:YOUR_USER/smocky#v0.1.0`.

### Compatibility
- Public exports unchanged: `defineConfig`, `startServer`, `runCli`,
  and the type surface (`Hook`, `MockConfig`, etc.) remain
  source-compatible.
- Bun-only for v0.1; Node distribution is intentionally deferred.

## [0.0.0]
- Initial development snapshot (pre-distribution).
