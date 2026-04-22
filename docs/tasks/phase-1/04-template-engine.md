# Task T-1.04: Template Engine

## Status
- [ ] Not started

## Goal
Implement the Liquid-lite template engine that walks JSON values and
resolves `{{ ... }}` tokens against the request context and helpers.

## Context
The engine powers all dynamic data inside `response.json`. It must enforce
the single-token vs embedded resolution rules (D-010), expose `req.*` and
helper namespaces (D-008, D-009), and reserve `db.*` for Phase 2 (D-011).

## Inputs / Prerequisites
- T-1.02, T-1.03 complete.
- Read: [`architecture/04-templating.md`](../../architecture/04-templating.md).
- Decisions: D-007, D-008, D-009, D-010, D-011.

## Deliverables
- `src/template.ts`

## Implementation Notes

### Public API
```ts
import type { Helper, Ctx } from './types';

export interface Engine {
  render(value: unknown, ctx: Ctx): Promise<unknown>;
}

export function createEngine(helpers: Map<string, Helper>): Engine;
```

### Walking
- Recursively descend objects/arrays.
- Only invoke the parser on string values.
- Object keys, numbers, booleans, null pass through unchanged.

### Tokenizing
A regex-based tokenizer is sufficient:

```ts
const TOKEN = /{{\s*([\s\S]+?)\s*}}/g;
```

Detect single-token mode: the entire trimmed string equals one token match.

### Argument Parsing
Inside a token: head + args separated by whitespace. Args may be
single/double-quoted strings or bare words. All arguments arrive at the
helper as **strings** (D-009).

```ts
function tokenize(expr: string): { head: string; args: string[] } {
  // simple split that respects quoted args
}
```

### Resolution
```ts
async function resolve(expr: string, ctx: Ctx): Promise<unknown> {
  const { head, args } = tokenize(expr);
  if (head.startsWith('req.')) return resolveReqPath(head.slice(4), ctx.req);
  if (head.startsWith('db.'))   throw new TemplateError('db.* is reserved (Phase 2)');
  const helper = helpers.get(head);
  if (!helper) throw new TemplateError(`unknown helper "${head}"`);
  return await helper(...args);
}
```

### `req.*` Path Walking
- `req.params.<name>`, `req.query.<name>`, `req.headers.<name>`,
  `req.body.<dot.path>`, `req.method`, `req.path`.
- Missing → `undefined`.

### Single vs Embedded Replacement
```ts
async function renderString(s: string, ctx: Ctx): Promise<unknown> {
  const matches = [...s.matchAll(TOKEN)];
  if (matches.length === 0) return s;

  const single = matches.length === 1 && matches[0][0] === s.trim();
  if (single) return await resolve(matches[0][1], ctx);

  let out = '';
  let i = 0;
  for (const m of matches) {
    out += s.slice(i, m.index);
    const value = await resolve(m[1], ctx);
    out += value === undefined ? '' : String(value);
    i = m.index! + m[0].length;
  }
  return out + s.slice(i);
}
```

### Escaping
Treat `{\{` as a literal `{{` so users can emit braces. Replace before
tokenization:

```ts
const ESCAPE = /\{\\\{/g;
const PLACEHOLDER = '\u0001';
// pre-replace to placeholder, run tokenizer, post-replace placeholder back
```

### Errors
Custom `TemplateError` class. Caught by the responder and turned into a
500 response with diagnostic body (T-1.07).

## Acceptance Criteria
- [ ] `{{ guid }}` returns the helper's actual return type when used as a
  whole string value.
- [ ] `id-{{ guid }}` returns a concatenated string.
- [ ] `req.params.id`, `req.query.q`, `req.headers.x`, `req.body.a.b` resolve.
- [ ] `db.*` raises `TemplateError`.
- [ ] Unknown helper raises `TemplateError`.
- [ ] Object/array structures recursively rendered.
- [ ] Helpers with arguments (`{{ randomInt 1 100 }}`) work.
- [ ] Async helpers awaited.

## Out of Scope
- Hook integration (T-1.06).
- DB namespace activation (Phase 2).

## References
- D-007, D-008, D-009, D-010, D-011
- [`architecture/04-templating.md`](../../architecture/04-templating.md)
