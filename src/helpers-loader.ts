import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { parse, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Helper } from './types';

const RESERVED = new Set(['req', 'db']);
const VALID_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export async function loadHelpers(
  dir: string,
  options?: { cacheBust?: string },
): Promise<Map<string, Helper>> {
  const helpers = new Map<string, Helper>();
  const absoluteDir = resolve(dir);

  let entries: string[];
  try {
    entries = await readdir(absoluteDir, 'utf8');
  } catch {
    return helpers;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) {
      continue;
    }

    const helperName = parse(entry).name;
    if (RESERVED.has(helperName)) {
      throw new Error(`[smocker] helper "${helperName}" collides with a reserved namespace`);
    }
    if (!VALID_NAME.test(helperName)) {
      throw new Error(`[smocker] invalid helper name "${helperName}"`);
    }
    if (helpers.has(helperName)) {
      throw new Error(`[smocker] duplicate helper "${helperName}"`);
    }

    const helperPath = resolve(absoluteDir, entry);
    const fileUrl = pathToFileURL(await prepareModuleImport(helperPath, options?.cacheBust));

    const mod = (await import(fileUrl.href)) as { default?: Helper };
    if (typeof mod.default !== 'function') {
      throw new Error(`[smocker] helper "${helperName}" must default-export a function`);
    }

    helpers.set(helperName, mod.default);
  }

  return helpers;
}

async function prepareModuleImport(modulePath: string, cacheBust?: string): Promise<string> {
  if (!cacheBust) {
    return modulePath;
  }

  const cacheDir = resolve(process.cwd(), '.smocker-cache', 'helpers');
  await mkdir(cacheDir, { recursive: true });
  const parsed = parse(modulePath);
  const sourceId = hashPath(modulePath);
  const targetPath = resolve(cacheDir, `${parsed.name}.${sourceId}.${cacheBust}${parsed.ext}`);
  await copyFile(modulePath, targetPath);
  await cleanupOldCopies(cacheDir, `${parsed.name}.${sourceId}.`, targetPath);
  return targetPath;
}

async function cleanupOldCopies(cacheDir: string, prefix: string, keepPath: string): Promise<void> {
  const entries = await readdir(cacheDir, 'utf8');
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(prefix) && resolve(cacheDir, entry) !== keepPath)
      .map((entry) => rm(resolve(cacheDir, entry), { force: true })),
  );
}

function hashPath(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
