# Helpers

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

- Flat directory (configurable via `smocky.config.ts → helpersDir`).
- Each `.ts` (or `.js`) file is one helper.
- The **filename** (without extension) is the **invocation name**.
- Discovery happens once at startup. Restart to pick up new helpers.

## Contract

Each helper file must default-export a function:

```ts
export default function helperName(...args: string[]): unknown {
  // …
}
```

| Aspect       | Rule                                              |
|--------------|---------------------------------------------------|
| Signature    | Variadic; arguments arrive as **strings**         |
| Return type  | Any JSON-serializable value                       |
| Sync/Async   | May be async; runner awaits                       |
| Errors       | Throws are caught and become 500 responses        |

### Why string arguments?

The template parser sees raw text inside `{{ … }}`. Coercion is the
helper's responsibility — this keeps the engine simple and gives helpers
full control over their input format.

## Examples

### `guid.ts`

```ts
export default function guid(): string {
  return crypto.randomUUID();
}
```

### `randomInt.ts`

```ts
export default function randomInt(min: string, max: string): number {
  const lo = Number(min);
  const hi = Number(max);
  if (Number.isNaN(lo) || Number.isNaN(hi)) {
    throw new Error(`randomInt: invalid bounds "${min}" / "${max}"`);
  }
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
```

### `now.ts`

```ts
export default function now(format: string = 'iso'): string {
  const d = new Date();
  if (format === 'iso')  return d.toISOString();
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

## Return Type → JSON

The single-token-vs-embedded rule from [Templating](templating.md) applies:

```json
{ "user": "{{ buildUser }}" }
// helper returns { name: 'A' } → { "user": { "name": "A" } }

{ "label": "u-{{ randomInt 1 10 }}" }
// helper returns 7 → { "label": "u-7" }
```

## Naming Restrictions

Helper names must:

- Match the filename (without `.ts` / `.js`).
- Not collide with reserved namespaces: `req`, `db`.
- Match `/^[A-Za-z][A-Za-z0-9_]*$/` (alphanumerics + underscore, starting
  with a letter).

A helper named `req.ts` is rejected at startup with a clear error.

## Loading Lifecycle

1. Server starts.
2. Helpers loader scans `helpersDir`.
3. Each file is dynamically imported.
4. Default export is registered under `path.basename(file, '.ts')`.
5. Map is shared with the template engine.

## Error Handling

| Situation                          | Outcome                                 |
|------------------------------------|-----------------------------------------|
| Helper file has no default export  | Startup error; server fails fast        |
| Two helpers with same name         | Startup error; resolution is ambiguous  |
| Reserved name (`req`, `db`)        | Startup error                           |
| Helper throws at runtime           | 500 response with `TemplateError` body  |
| Helper returns `undefined`         | Treated as `null` in single-token mode  |
