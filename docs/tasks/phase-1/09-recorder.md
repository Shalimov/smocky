# Task T-1.09: Recorder

## Status
- [x] Complete (2026-04-22)

## Goal
Persist proxied responses as `response.json` stub files in the configured
output directory, respecting `include`/`exclude` filters and the
`overwrite` policy.

## Context
The recorder enables fast bootstrapping of mock suites. It runs only when
`record.enabled` is true (D-016) and writes schema-formatted JSON only
(D-017).

## Inputs / Prerequisites
- T-1.02, T-1.08 complete.
- Read: [`architecture/08-proxy-and-recorder.md`](../../architecture/08-proxy-and-recorder.md).
- Decisions: D-016, D-017.

## Deliverables
- `src/recorder.ts`

## Implementation Notes

### Public API
```ts
export interface Recorder {
  shouldRecord(path: string): boolean;
  record(req: Request, res: Response): Promise<void>;
}

export function createRecorder(cfg: ResolvedConfig['record']): Recorder;
```

### Filter Logic
```ts
function shouldRecord(path: string): boolean {
  if (matches(path, cfg.exclude)) return false;
  if (cfg.include.length > 0 && !matches(path, cfg.include)) return false;
  return true;
}

function matches(path: string, rules: Array<string | RegExp>): boolean {
  for (const r of rules) {
    if (typeof r === 'string' && path.startsWith(r)) return true;
    if (r instanceof RegExp && r.test(path)) return true;
  }
  return false;
}
```

### Recording Algorithm
```ts
async function record(req: Request, res: Response): Promise<void> {
  if (!cfg.enabled) return;
  const url = new URL(req.url);
  if (!shouldRecord(url.pathname)) return logSkip(url.pathname, 'filter');

  // Only record JSON responses (D-017)
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return logSkip(url.pathname, 'non-json body');
  }

  const folder = pathToFolder(url.pathname, cfg.outputDir);
  await mkdir(folder, { recursive: true });
  const file = join(folder, 'response.json');

  const body = await res.clone().json();
  const block = {
    status: res.status,
    headers: pickRelevantHeaders(res.headers),
    body,
  };

  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(await readFile(file, 'utf8')); } catch {}

  const method = req.method.toUpperCase();
  if (existing[method] && !cfg.overwrite) {
    return logSkip(url.pathname, 'exists');
  }
  existing[method] = block;
  await writeFile(file, JSON.stringify(existing, null, 2));
  log('saved', method, url.pathname, file);
}

function pathToFolder(path: string, root: string): string {
  const parts = path.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
  return resolve(root, ...parts);
}
```

### Header Filtering
Only persist a small allow-list of meaningful headers
(`content-type`, `cache-control`, custom `x-*`). Drop `set-cookie`,
`date`, etc. to keep stubs deterministic.

### Numeric IDs Note
`/users/42` becomes `endpoints/users/42/`. Users refactor manually to
`_id/` after recording (intentional — see D-017 / out-of-scope notes).

## Acceptance Criteria
- [ ] Recorder no-ops when `enabled: false`.
- [ ] `exclude` always wins over `include`.
- [ ] Empty `include` means "record everything not excluded."
- [ ] Existing method block preserved unless `overwrite: true`.
- [ ] Non-JSON responses logged and skipped.
- [ ] Folder structure mirrors path segments.

## Out of Scope
- Auto-detection of dynamic segments.
- Binary body persistence (D-017 / out-of-scope doc).

## References
- D-016, D-017
- [`architecture/08-proxy-and-recorder.md`](../../architecture/08-proxy-and-recorder.md)
