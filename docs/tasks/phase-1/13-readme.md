# Task T-1.13: README

## Status
- [ ] Not started

## Goal
Write a top-level `README.md` that gives users a 5-minute onboarding to
Smocker: what it is, how to run it, how to write a mock, how to use
helpers and hooks, how to record, how to configure.

## Context
Last task of Phase 1. Synthesizes the user-facing surface into prose with
copy-paste examples.

## Inputs / Prerequisites
- T-1.10 (server runs), T-1.12 (examples exist).
- Read: all `architecture/*.md`.

## Deliverables
- `/README.md`

## Implementation Notes

### Suggested Outline

```
# Smocker

> One-line tagline.

## Why Smocker?
3-bullet pitch.

## Quick Start
bun install
bun run dev
curl localhost:3000/users

## Folder Conventions
endpoints/<path>/, _param folders, response.json, hook.ts, helpers/.

## Writing a Mock
- Static example
- Dynamic example
- Multiple methods

## Templating
- {{ req.params.x }}, etc.
- {{ helperName arg1 arg2 }}
- Single vs embedded resolution rules

## Hooks
Sample TS file + when to use one.

## Record Mode
Toggle in config or with --record. include/exclude rules.

## Configuration Reference
Annotated mock.config.ts.

## Library Use
import { startServer } …

## CLI Reference
smocker serve, smocker check (stub), flags, env vars.

## Roadmap
Phase 2 DB, Phase 3 OpenAPI checker — link to docs/.

## License
```

### Style
- Code blocks should be runnable as-is.
- Each major section ends with a "Read more →" link to the corresponding
  `docs/architecture/*.md`.
- No emojis unless the user asks.

### Cross-Linking
Every concept should link back into `docs/`:

```
For the full request lifecycle, see [docs/architecture/03-request-lifecycle.md](docs/architecture/03-request-lifecycle.md).
```

## Acceptance Criteria
- [ ] A new user can install, run, and modify a mock in under 5 minutes
      using only the README.
- [ ] All code blocks compile/run.
- [ ] Links to architecture docs work from the repo root.
- [ ] No undocumented config field, CLI flag, or template feature.

## Out of Scope
- API reference docs (the architecture folder serves this role).
- Tutorials beyond quick start.

## References
- All architecture docs
- All Phase 1 task files
