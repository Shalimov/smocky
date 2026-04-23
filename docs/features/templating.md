# Templating

Smocky's template engine is a **Liquid-lite** interpolator that runs on
every string value inside `response.json`. Use it to:

1. Pull live data from the incoming request (`req.params.id`, …).
2. Generate dynamic data via user-defined helpers (`guid`, `randomInt`, …).
3. Read from the in-memory database (`db.users.all`, …).

## Token Syntax

```
{{ <expression> }}
```

The expression is parsed into a head token and zero or more arguments,
whitespace-separated:

```
{{ req.params.id }}
{{ guid }}
{{ randomInt 1 100 }}
{{ now 'iso' }}
```

Strings can be single- or double-quoted. Numbers and other tokens are
passed as raw strings; helpers parse what they need.

## Where Tokens Are Evaluated

The engine recursively walks the response object and only interpolates
**string values**. Object keys, numbers, booleans, and nulls pass through
untouched.

```json
{
  "id":     "{{ req.params.id }}",   ← evaluated
  "uuid":   "{{ guid }}",            ← evaluated
  "count":  5,                       ← passes through
  "static": "static-string"          ← passes through (no token)
}
```

Headers are also rendered through the engine.

## Resolution Rules

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
| `null` / `undefined` | `null`                     |

```json
{ "count": "{{ randomInt 1 10 }}" }
// → { "count": 7 }
```

### Embedded Tokens → Stringification & Concatenation

If the token is part of a larger string, the result is coerced to a string:

```json
{ "label": "user-{{ req.params.id }}" }
// → { "label": "user-42" }
```

`undefined` becomes the empty string in embedded mode.

## Built-In Namespaces

### `req.*`

| Path                    | Description                              |
|-------------------------|------------------------------------------|
| `req.method`            | Uppercased HTTP method                   |
| `req.path`              | Normalized URL path                      |
| `req.params.<name>`     | Dynamic segment value                    |
| `req.query.<name>`      | Query-string value (or array)            |
| `req.headers.<name>`    | Lowercased header value                  |
| `req.body.<dot.path>`   | Parsed JSON body, dot-walked             |

### `db.*`

Read-only collection access (see [Database](database.md)):

```
{{ db.users.all }}
{{ db.users.find req.params.id }}
{{ db.users.where active=true }}
```

Mutating methods (`insert`, `update`, `remove`) are **not** available in
templates — use a [hook](hooks.md).

## Helpers

Any token whose head is not `req` or `db` is looked up in `helpers/`. See
[Helpers](helpers.md) for the contract.

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

## Escaping

To emit a literal `{{`, escape the second brace: `{\{`. The engine treats
that pair as a non-token. Plain single `{` is fine since the lexer requires
two consecutive braces.

## Errors

| Condition                          | Behavior                                 |
|------------------------------------|------------------------------------------|
| Unknown helper                     | 500 with `TemplateError` body            |
| Helper throws                      | 500 with `TemplateError` (cause attached)|
| `req.body` accessed but no body    | Resolves to `undefined`                  |
| `db.*` mutation in template        | 500 with "use a hook" message            |
