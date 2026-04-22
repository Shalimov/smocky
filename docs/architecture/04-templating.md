# 04 — Templating

Smocker's template engine is a **Liquid-lite** interpolator that runs on
every string value inside `response.json`. It powers two abilities:

1. Pull live data from the incoming request (`req.params.id`, …).
2. Generate dynamic data via user-defined helpers (`guid`, `randomInt`, …).

## Token Syntax (D-007)

```
{{ <expression> }}
```

The expression is parsed into a head token and zero or more arguments,
whitespace-separated. Examples:

```
{{ req.params.id }}
{{ guid }}
{{ randomInt 1 100 }}
{{ now 'iso' }}
```

Strings can be single- or double-quoted. Numbers are passed as strings
to helpers (D-009 — helpers parse what they need).

## Where Tokens Are Evaluated

The engine recursively walks the response object and only interpolates
**string values**. Object keys, numbers, booleans, and nulls pass through
untouched.

```json
{
  "id": "{{ req.params.id }}",        ← evaluated
  "uuid": "{{ guid }}",               ← evaluated
  "count": 5,                          ← passes through
  "createdAt": "static-string"         ← passes through (no token)
}
```

## Resolution Rules (D-010)

### Single-Token Strings → Typed Replacement

When the entire string consists of a single token, the JSON value is
replaced with the helper's actual return type:

| Helper return | Resulting JSON                    |
|---------------|-----------------------------------|
| `string`      | `"value"`                         |
| `number`      | `42`                              |
| `boolean`     | `true`                            |
| `object`      | `{ "k": "v" }`                    |
| `array`       | `[1, 2, 3]`                       |
| `null`        | `null`                            |

```json
{ "count": "{{ randomInt 1 10 }}" }
// → { "count": 7 }
```

### Embedded Tokens → Stringification & Concatenation

If the token is part of a larger string, the result is coerced to a string
and inserted in place:

```json
{ "label": "user-{{ req.params.id }}" }
// → { "label": "user-42" }
```

## Built-In Namespaces

### `req.*` (D-008)

| Path                    | Description                              |
|-------------------------|------------------------------------------|
| `req.method`            | Uppercased HTTP method                   |
| `req.path`              | Normalized URL path                      |
| `req.params.<name>`     | Dynamic segment value                    |
| `req.query.<name>`      | Query-string value (or array)            |
| `req.headers.<name>`    | Lowercased header value                  |
| `req.body.<dot.path>`   | Parsed JSON body, dot-walked             |

Missing values resolve to `undefined`, which is serialized as `null` in
single-token mode and `""` in embedded mode.

### `db.*` — Phase 2 (D-011, D-025)

Read-only collection access:

```
{{ db.users.all }}
{{ db.users.find req.params.id }}
{{ db.users.where active=true }}
```

In Phase 1 these tokens raise an error: `db.* is reserved (Phase 2)`.

## Helpers (D-009)

Helpers are user-supplied functions in `helpers/`. The engine treats them as
the catch-all: any token whose head is not a built-in namespace is looked up
as a helper.

```ts
// helpers/randomInt.ts
export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
```

```json
{ "n": "{{ randomInt 1 100 }}" }
```

See [`06-helpers.md`](06-helpers.md) for the full helper contract.

## Escaping

To emit a literal `{{`, escape the second brace: `{\{`. The engine treats
that pair as a non-token. (Plain `{` is also fine since the lexer requires
two consecutive braces.)

## Errors

| Condition                          | Behavior                                 |
|------------------------------------|------------------------------------------|
| Unknown helper                     | Throw `TemplateError`; responder → 500   |
| `req.body` accessed but no body    | Resolves to `undefined`                  |
| Helper throws                      | Throw `TemplateError` with cause         |
| `db.*` in Phase 1                  | Throw `TemplateError` with explanation   |

## Performance Notes

- The walker is non-recursive on string values (only descends containers).
- Helpers are loaded once at server startup; lookups are O(1).
- Template parsing is lazy: each string is scanned only when needed.

## References

- D-007, D-008, D-009, D-010, D-011, D-025
- [`05-hooks.md`](05-hooks.md), [`06-helpers.md`](06-helpers.md)
