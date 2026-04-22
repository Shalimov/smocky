import { readdir, readFile } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';

import type { Db } from './db';

export async function loadSeeds(db: Db, dir: string): Promise<void> {
  const absoluteDir = resolve(dir);
  let files: string[];

  try {
    files = await readdir(absoluteDir, 'utf8');
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }

    const collectionName = parse(file).name;
    const filePath = join(absoluteDir, file);
    const content = await readFile(filePath, 'utf8');

    let items: unknown;
    try {
      items = JSON.parse(content);
    } catch (error) {
      throw new Error(`db/${file}: invalid JSON - ${(error as Error).message}`);
    }

    if (!Array.isArray(items)) {
      throw new Error(`db/${file}: must be a JSON array`);
    }

    db.hydrate(collectionName, items);
  }
}
