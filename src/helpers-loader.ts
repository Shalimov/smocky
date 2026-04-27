import { readdir } from 'node:fs/promises';
import { parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Helper } from './types';

const RESERVED = new Set(['req', 'db']);
const VALID_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export async function loadHelpers(
  dir: string,
): Promise<Map<string, Helper>> {
  const helpers = new Map<string, Helper>();
  const absoluteDir = resolve(dir);

  let entries: string[];
  try {
    entries = await readdir(absoluteDir, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return helpers;
    }
    console.warn(`[smocky] failed to read helpers directory: ${error instanceof Error ? error.message : String(error)}`);
    return helpers;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) {
      continue;
    }

    const helperName = parse(entry).name;
    if (RESERVED.has(helperName)) {
      throw new Error(`[smocky] helper "${helperName}" collides with a reserved namespace`);
    }
    if (!VALID_NAME.test(helperName)) {
      throw new Error(`[smocky] invalid helper name "${helperName}"`);
    }
    if (helpers.has(helperName)) {
      throw new Error(`[smocky] duplicate helper "${helperName}"`);
    }

    const helperPath = resolve(absoluteDir, entry);
    const fileUrl = pathToFileURL(helperPath);

    let mod: { default?: Helper };
    try {
      mod = (await import(fileUrl.href)) as { default?: Helper };
    } catch (error) {
      throw new Error(`[smocky] failed to load helper "${helperName}": ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof mod.default !== 'function') {
      throw new Error(`[smocky] helper "${helperName}" must default-export a function`);
    }

    helpers.set(helperName, mod.default);
  }

  return helpers;
}
