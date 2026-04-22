# Smocker Documentation

Smocker is a Bun-powered, convention-over-configuration mock HTTP server.
Mock the endpoints you care about, transparently proxy everything else,
and validate against an OpenAPI spec when you need to.

> Mock surgically. Proxy everything else. Validate against the real spec.

## Start Here

- [Getting Started](getting-started.md) — install, run, write your first mock.

## Features

| Feature | What it does |
|---|---|
| [Conventions](features/conventions.md) | Filesystem layout that drives everything |
| [Routing](features/routing.md) | How URLs map to folders, dynamic params, precedence |
| [Templating](features/templating.md) | `{{ }}` token syntax for dynamic responses |
| [Helpers](features/helpers.md) | User-defined functions callable from templates |
| [Hooks](features/hooks.md) | Per-endpoint TypeScript handlers that mutate responses |
| [Proxy & Recorder](features/proxy-and-recorder.md) | Fall through to a real backend; record stubs |
| [Database](features/database.md) | Shared in-memory store seeded from `db/*.json` |
| [OpenAPI Checker](features/openapi-checker.md) | `smocker check` CLI for spec drift |

## Reference

- [Configuration](reference/configuration.md) — full `mock.config.ts` schema
- [CLI & Library API](reference/api.md) — `smocker` command and `startServer`

## Project Layout

```
your-project/
├── mock.config.ts           # configuration
├── endpoints/               # mocked routes
│   └── users/
│       ├── response.json
│       ├── hook.ts
│       └── _id/
│           └── response.json
├── helpers/                 # template helpers
│   ├── guid.ts
│   └── randomInt.ts
└── db/                      # optional seed data
    └── users.json
```
