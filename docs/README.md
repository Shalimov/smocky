# Smocky Documentation

Smocky is a Bun-powered, convention-over-configuration mock HTTP server.
Mock the endpoints you care about, transparently proxy everything else,
and validate against an OpenAPI spec when you need to.

> Mock surgically. Proxy everything else. Validate against the real spec.

## Get started in three commands

```bash
bun add -d github:YOUR_USER/smocky#v0.1.0   # install (Bun >= 1.1)
bun smocky init                              # scaffold a project
bun smocky serve                             # start the mock server
```

That's it — `bun smocky init` writes `smocky.config.ts`, a couple of
example endpoints, and (optionally) a helper, a `db/` seed, and a
`tsconfig.json`. Use `--from-openapi <spec>` to generate the entire
endpoint tree from an OpenAPI document instead.

- New here? Read **[Getting Started](getting-started.md)** for the
  guided walkthrough — what each scaffolded file looks like and how to
  extend it.
- Already comfortable? Jump straight to **[`smocky init`](features/init.md)**
  for every flag of the scaffolder, or to the [CLI reference](reference/api.md)
  for `serve` and `check`.

## Features

| Feature | What it does |
|---|---|
| [`smocky init`](features/init.md) | Scaffold a project blank or from an OpenAPI spec |
| [Conventions](features/conventions.md) | Filesystem layout that drives everything |
| [Routing](features/routing.md) | How URLs map to folders, dynamic params, precedence |
| [Templating](features/templating.md) | `{{ }}` token syntax for dynamic responses |
| [Helpers](features/helpers.md) | User-defined functions callable from templates |
| [Hooks](features/hooks.md) | Per-endpoint TypeScript handlers that mutate responses |
| [Proxy & Recorder](features/proxy-and-recorder.md) | Fall through to a real backend; record stubs |
| [Database](features/database.md) | Shared in-memory store seeded from `db/*.json` |
| [OpenAPI Checker](features/openapi-checker.md) | `smocky check` CLI for spec drift |

## Reference

- [Configuration](reference/configuration.md) — full `smocky.config.ts` schema
- [CLI & Library API](reference/api.md) — `smocky` command, `startServer`, and `Smocky` class

## Project Layout

A typical project (matching what `smocky init --examples --helpers --db`
produces) looks like:

```text
your-project/
├── smocky.config.ts        # configuration
├── endpoints/               # mocked routes
│   ├── health/
│   │   └── response.json
│   └── users/
│       ├── response.json
│       ├── hook.ts          # optional, for conditional logic
│       └── _id/             # _name folders capture dynamic segments
│           └── response.json
├── helpers/                 # template helpers
│   └── guid.ts
└── db/                      # optional seed data
    └── users.json
```

You can omit `helpers/` and `db/` entirely if you don't need them — the
only required pieces are `smocky.config.ts` and at least one
`endpoints/<path>/response.json`.
