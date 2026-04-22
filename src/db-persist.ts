import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface DbPersister {
  schedule(name: string, items: unknown[]): void;
  flush(): Promise<void>;
}

interface CollectionState {
  items: unknown[];
  timer?: ReturnType<typeof setTimeout>;
  pending: Promise<void>;
}

export function createDbPersister(opts: { dir: string; debounceMs?: number }): DbPersister {
  const debounceMs = opts.debounceMs ?? 100;
  const states = new Map<string, CollectionState>();

  function ensureState(name: string): CollectionState {
    const existing = states.get(name);
    if (existing) {
      return existing;
    }

    const created: CollectionState = {
      items: [],
      pending: Promise.resolve(),
    };
    states.set(name, created);
    return created;
  }

  function queueWrite(name: string): void {
    const state = ensureState(name);
    const snapshot = structuredClone(state.items);

    state.pending = state.pending
      .catch(() => undefined)
      .then(async () => {
        await writeCollection(opts.dir, name, snapshot);
      });
  }

  return {
    schedule(name: string, items: unknown[]): void {
      const state = ensureState(name);
      state.items = structuredClone(items);
      if (state.timer) {
        clearTimeout(state.timer);
      }

      state.timer = setTimeout(() => {
        state.timer = undefined;
        queueWrite(name);
      }, debounceMs);
    },
    async flush(): Promise<void> {
      for (const [name, state] of states) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = undefined;
          queueWrite(name);
        }
      }

      await Promise.all([...states.values()].map((state) => state.pending.catch(() => undefined)));
    },
  };
}

async function writeCollection(dir: string, name: string, items: unknown[]): Promise<void> {
  const filePath = resolve(dir, `${name}.json`);
  const tempPath = `${filePath}.tmp`;

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    console.warn(
      `[smocker] db persistence error for ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
