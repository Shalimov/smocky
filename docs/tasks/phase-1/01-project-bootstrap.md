# Task T-1.01: Project Bootstrap

## Status
- [ ] Not started

## Goal
Initialize the Smocker project with package metadata, TypeScript configuration,
and baseline tooling files so subsequent tasks have a workspace to build in.

## Context
First task of Phase 1. No prerequisites. Establishes the foundation every
later task assumes (Bun runtime, TypeScript strict mode, no runtime npm
dependencies — D-021).

## Inputs / Prerequisites
- None.
- Read: [`architecture/01-overview.md`](../../architecture/01-overview.md),
  [`architecture/10-public-api.md`](../../architecture/10-public-api.md),
  D-018, D-020, D-021.

## Deliverables
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `bunfig.toml` (if needed for Bun-specific defaults)

## Implementation Notes

### `package.json`
```jsonc
{
  "name": "smocker",
  "version": "0.1.0",
  "description": "Convention-over-configuration mock server for Bun.",
  "type": "module",
  "module": "src/index.ts",
  "bin": { "smocker": "src/index.ts" },
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts"
  },
  "scripts": {
    "dev": "bun run src/index.ts serve",
    "start": "bun run src/index.ts serve",
    "record": "RECORD=1 bun run src/index.ts serve",
    "check:api": "bun run src/index.ts check api",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/bun": "latest"
  }
}
```

### `tsconfig.json`
```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "lib": ["ESNext"],
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*", "mock.config.ts"]
}
```

### `.gitignore`
```
node_modules/
.DS_Store
*.log
dist/
```

## Acceptance Criteria
- [ ] `bun install` succeeds with no errors.
- [ ] `bun run typecheck` passes (with empty src/, only the config types).
- [ ] No runtime dependencies in `package.json` (devDependencies only).
- [ ] `package.json` declares `bin: { smocker: ... }` so global CLI works.

## Out of Scope
- Source files (other tasks).
- README content (T-1.13).
- Examples (T-1.12).

## References
- D-018, D-020, D-021
- [`architecture/10-public-api.md`](../../architecture/10-public-api.md)
