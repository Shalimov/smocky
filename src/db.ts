export interface Collection<T = any> {
  all(): T[];
  find(id: string): T | undefined;
  where(match: Partial<T>): T[];
  query(predicate: (item: T) => boolean): T[];
  insert(item: Partial<T>): T;
  update(id: string, patch: Partial<T>): T | undefined;
  remove(id: string): boolean;
}

export interface Db {
  collection<T = any>(name: string): Collection<T>;
  collections(): string[];
  reset(): void;
  flush(): Promise<void>;
  hydrate(name: string, items: any[]): void;
}

interface CreateDbOptions {
  autoId?: 'uuid';
  onMutation?: (name: string, items: unknown[]) => void | Promise<void>;
  onFlush?: () => Promise<void>;
}

export function createDb(options: CreateDbOptions = {}): Db {
  const data = new Map<string, Record<string, unknown>[]>();

  function getItems(name: string): Record<string, unknown>[] {
    const existing = data.get(name);
    if (existing) {
      return existing;
    }

    const created: Record<string, unknown>[] = [];
    data.set(name, created);
    return created;
  }

  function notifyMutation(name: string): void {
    if (!options.onMutation) {
      return;
    }

    void Promise.resolve(options.onMutation(name, cloneItems(getItems(name))));
  }

  return {
    collection<T = any>(name: string): Collection<T> {
      return {
        all(): T[] {
          return cloneItems(getItems(name)) as T[];
        },
        find(id: string): T | undefined {
          const found = getItems(name).find((item) => String(item.id) === id);
          return found ? (cloneValue(found) as T) : undefined;
        },
        where(match: Partial<T>): T[] {
          const entries = Object.entries(match as Record<string, unknown>);
          return getItems(name)
            .filter((item) => entries.every(([key, value]) => item[key] === value))
            .map((item) => cloneValue(item) as T);
        },
        query(predicate: (item: T) => boolean): T[] {
          return getItems(name)
            .filter((item) => predicate(cloneValue(item) as T))
            .map((item) => cloneValue(item) as T);
        },
        insert(item: Partial<T>): T {
          const record = cloneRecord(item as Record<string, unknown>);
          const stored: Record<string, unknown> = {
            ...record,
            id: typeof record.id === 'string' && record.id ? record.id : createId(),
          };
          getItems(name).push(stored);
          notifyMutation(name);
          return cloneValue(stored) as T;
        },
        update(id: string, patch: Partial<T>): T | undefined {
          const items = getItems(name);
          const index = items.findIndex((item) => String(item.id) === id);
          if (index < 0) {
            return undefined;
          }

          const current = items[index] ?? {};
          const nextPatch = cloneRecord(patch as Record<string, unknown>);
          delete nextPatch.id;
          const updated: Record<string, unknown> = {
            ...current,
            ...nextPatch,
            id: current.id,
          };
          items[index] = updated;
          notifyMutation(name);
          return cloneValue(updated) as T;
        },
        remove(id: string): boolean {
          const items = getItems(name);
          const index = items.findIndex((item) => String(item.id) === id);
          if (index < 0) {
            return false;
          }

          items.splice(index, 1);
          notifyMutation(name);
          return true;
        },
      };
    },
    collections(): string[] {
      return [...data.keys()].sort();
    },
    reset(): void {
      data.clear();
    },
    async flush(): Promise<void> {
      await (options.onFlush?.() ?? Promise.resolve());
    },
    hydrate(name: string, items: any[]): void {
      data.set(name, cloneItems(items as Record<string, unknown>[]));
    },
  };
}

function createId(): string {
  return crypto.randomUUID();
}

function cloneItems<T>(items: T[]): T[] {
  return items.map((item) => cloneValue(item));
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return cloneValue(record);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
