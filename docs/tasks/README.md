# Task Files

This folder contains all implementation tasks for Smocker, organized by
phase. Each file is self-contained and follows a uniform template
(see [Task File Template](#task-file-template) below).

## Identifier Scheme

```
T-<phase>.<NN>
```

For example, `T-1.04` is Phase 1, Task 04 — Template Engine.

## Phase Overview

| Phase | Theme                              | Tasks | Folder                  |
|-------|------------------------------------|-------|-------------------------|
| 1     | Mock server core                   | 13    | [`phase-1/`](phase-1/)  |
| 2     | Shared in-memory DB                | 7     | [`phase-2/`](phase-2/)  |
| 3     | OpenAPI checker (CLI)              | 9     | [`phase-3/`](phase-3/)  |

## Phase 1 Dependency Graph

```mermaid
graph TD
  T101[T-1.01 Bootstrap] --> T102[T-1.02 Types & Config]
  T102 --> T103[T-1.03 Helpers Loader]
  T102 --> T104[T-1.04 Template Engine]
  T103 --> T104
  T102 --> T105[T-1.05 Router]
  T102 --> T106[T-1.06 Hook Runner]
  T104 --> T107[T-1.07 Responder]
  T105 --> T107
  T106 --> T107
  T102 --> T108[T-1.08 Proxy]
  T108 --> T109[T-1.09 Recorder]
  T107 --> T110[T-1.10 Server Bootstrap]
  T108 --> T110
  T109 --> T110
  T110 --> T111[T-1.11 CLI & Stubs]
  T110 --> T112[T-1.12 Examples]
  T111 --> T113[T-1.13 README]
  T112 --> T113
```

## Phase 2 Dependency Graph

Prerequisite: Phase 1 complete.

```mermaid
graph TD
  T201[T-2.01 DB Core] --> T202[T-2.02 DB Loader]
  T202 --> T203[T-2.03 Context Integration]
  T203 --> T204[T-2.04 Template DB Access]
  T201 --> T205[T-2.05 Persistence Toggle]
  T203 --> T206[T-2.06 Auto-CRUD Decision]
  T204 --> T207[T-2.07 Examples & Docs]
  T206 --> T207
```

## Phase 3 Dependency Graph

Prerequisite: Phase 1 complete (Phase 2 not required).

```mermaid
graph TD
  T301[T-3.01 Spec Loader] --> T302[T-3.02 Validator]
  T302 --> T303[T-3.03 Sample Generator]
  T303 --> T304[T-3.04 API Checker]
  T302 --> T305[T-3.05 Mock Checker]
  T304 --> T306[T-3.06 Reporter]
  T305 --> T306
  T306 --> T307[T-3.07 CLI Wiring]
  T307 --> T308[T-3.08 Config Extension]
  T308 --> T309[T-3.09 Docs & Examples]
```

## Task File Template

Every task file uses the structure below.

```markdown
# Task <ID>: <Title>

## Status
- [ ] Not started

## Goal
One-sentence description.

## Context
Why this task exists, how it relates to other tasks.

## Inputs / Prerequisites
- Other tasks that must be complete first
- Architecture docs to read

## Deliverables
- Files created/modified with paths
- Public API additions/changes

## Implementation Notes
Step-by-step guidance, code shape examples, edge cases.

## Acceptance Criteria
- [ ] Verifiable outcomes

## Out of Scope
Explicit non-goals to prevent scope creep.

## References
Architecture docs and decision log entries.
```

## How to Pick a Task

1. Choose a phase that meets the prerequisites.
2. Pick the lowest-numbered task whose prerequisites are complete.
3. Read the referenced architecture docs first.
4. Confirm acceptance criteria before marking the task complete.

## Updating Status

Tick the `## Status` checkbox in the task file when complete:

```markdown
## Status
- [x] Complete (2026-MM-DD)
```
