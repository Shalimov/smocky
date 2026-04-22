# Smocker Documentation

Smocker is a Bun-based, convention-over-configuration mock server for frontend
development. It combines filesystem routing, transparent proxy fallback,
request-aware templating, mutation hooks, a recorder, an in-memory database,
and OpenAPI contract validation.

This `docs/` folder contains all architectural documentation, locked design
decisions, and granular task files needed to implement Smocker across three
phases — without writing a single line of source code yet.

## How to Read These Docs

Recommended reading order for first-time readers:

1. [`architecture/01-overview.md`](architecture/01-overview.md) — what Smocker
   is and why it exists.
2. [`architecture/02-conventions.md`](architecture/02-conventions.md) — the
   filesystem conventions that drive everything.
3. [`architecture/03-request-lifecycle.md`](architecture/03-request-lifecycle.md)
   — end-to-end request flow.
4. The remaining architecture docs in numerical order for deeper detail.
5. [`decisions/decision-log.md`](decisions/decision-log.md) — the rationale
   behind every locked design choice.
6. [`tasks/README.md`](tasks/README.md) — when ready to implement.

## Folder Map

```
docs/
├── README.md                  ← you are here
├── architecture/              ← design specifications
│   ├── 01-overview.md
│   ├── 02-conventions.md
│   ├── 03-request-lifecycle.md
│   ├── 04-templating.md
│   ├── 05-hooks.md
│   ├── 06-helpers.md
│   ├── 07-routing.md
│   ├── 08-proxy-and-recorder.md
│   ├── 09-configuration.md
│   ├── 10-public-api.md
│   ├── 11-database.md         ← Phase 2
│   ├── 12-openapi-checker.md  ← Phase 3
│   └── 13-out-of-scope.md
├── decisions/
│   └── decision-log.md        ← ADR-style record of every decision
└── tasks/
    ├── README.md              ← how to use task files
    ├── phase-1/               ← mock server core (13 tasks)
    ├── phase-2/               ← shared in-memory DB (7 tasks)
    └── phase-3/               ← OpenAPI checker (9 tasks)
```

## Three-Phase Roadmap

| Phase | Theme                              | Tasks |
|-------|------------------------------------|-------|
| 1     | Mock server core                   | 13    |
| 2     | Shared in-memory DB                | 7     |
| 3     | OpenAPI contract validation (CLI)  | 9     |

Phase 1 ships a fully usable mock server with proxy + recorder. Phases 2 and 3
are pre-designed and deferred — their task files are complete and ready to
execute when prioritized.

## Conventions Used in These Docs

- **TypeScript snippets** illustrate API shapes; treat them as
  implementation guidance, not literal code.
- **Mermaid diagrams** are used for sequences and dependency graphs; render
  them in any compatible viewer (GitHub, Obsidian, VS Code with the Mermaid
  extension, etc.).
- **`D-NNN`** identifiers refer to entries in
  [`decisions/decision-log.md`](decisions/decision-log.md).
- **`T-P.NN`** identifiers refer to task files (e.g. `T-1.04` =
  Phase 1, Task 04 — Template Engine).
