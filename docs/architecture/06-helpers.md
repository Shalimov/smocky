# 06 — Helpers

Helpers are user-defined functions invoked from inside `response.json` via
the templating engine. They generate values that vary per request: ids,
timestamps, random data, computed strings, etc.

## File Location & Discovery

```
helpers/
├── guid.ts
├── randomInt.ts
└── now.ts
```

- Flat directory (configurable via `mock.config.ts → helpersDir`).
- Each `.ts` file is one helper.
- The **filename** (without extension) is the **invocation name**.
- Discovery happens once at startup. Restart to pick up new helpers
  (no hot reload — D-032).

## Contract (D-009)

Each helper file must default-export a function:

```ts
export default function helperName(...args: string[]): JsonValue {
  // …
}
```

| Aspect       | Rule                                              |
|--------------|---------------------------------------------------|
| Signature    | Variadic; arguments arrive as **strings**         |
| Return type  | Any JSON-serializable value                        |
| Sync/Async   | May be async; runner awaits                       |
| Errors       | Throws are caught, become 500s with diagnostic    |

### Why string arguments?

The template parser sees raw text inside `{{ … }}`. Coercion is the helper's
responsibility — this keeps the engine simple and gives helpers full control
over their input format.

```ts
// helpers/randomInt.ts
export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    throw new Error(`randomInt: invalid bounds "${min}" / "${max}"`);
  }
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
```

## Examples

### `guid.ts`

```ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

### `now.ts`

```ts
export default function now(format: string = 'iso'): string {
  const d = new Date();
  if (format === 'iso') return d.toISOString();
  if (format === 'unix') return String(Math.floor(d.getTime() / 1000));
  return d.toString();
}
```

### `pick.ts`

```ts
export default function pick(...options: string[]): string {
  return options[Math.floor(Math.random() * options.length)] ?? '';
}
```

```json
{ "status": "{{ pick 'pending' 'active' 'done' }}" }
```

## Return Type → JSON Mapping (D-010)

Helpers may return any JSON value. The engine's
[single-token-vs-embedded](04-templating.md) rule applies:

```json
{ "user": "{{ buildUser }}" }
// helper returns { name: 'A' } → { "user": { "name": "A" } }

{ "label": "u-{{ randomInt 1 10 }}" }
// helper returns 7 → { "label": "u-7" }
```

## Naming Restrictions

Helper names must:

- Match the filename (without `.ts`).
- Not collide with reserved namespaces: `req`, `db`.
- Be valid token heads (alphanumerics + underscore, starting with a letter).

A helper named `req.ts` is rejected at startup with a clear error.

## Loading Lifecycle

1. Server starts.
2. `helpers-loader.ts` scans `helpersDir`.
3. Each file is dynamically imported.
4. Default export is registered under `path.basename(file, '.ts')`.
5. Map is frozen and shared with the template engine.

## Error Handling

| Situation                          | Outcome                                 |
|------------------------------------|-----------------------------------------|
| Helper file has no default export  | Startup error; server fails fast        |
| Two helpers with same name         | Startup error; resolution is ambiguous  |
| Helper throws at runtime           | 500 response with `HelperError` body    |
| Helper returns `undefined`         | Treated as `null` in single-token mode  |

## References

- D-009, D-010, D-032
- [`04-templating.md`](04-templating.md)
