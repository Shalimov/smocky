import { copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Ctx, Hook, MockRequest, MockResponse } from './types';

const cache = new Map<string, Hook>();
let hookVersion = 0;

export class HookError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HookError';
  }
}

export async function runHook(
  hookFile: string | null,
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
): Promise<void> {
  if (!hookFile) {
    return;
  }

  let hook = cache.get(hookFile);
  if (!hook) {
    const importPath = await prepareHookImport(hookFile, hookVersion);
    const fileUrl = pathToFileURL(importPath);

    const mod = (await import(fileUrl.href)) as { default?: Hook };
    if (typeof mod.default !== 'function') {
      throw new HookError(`hook "${hookFile}" must default-export a function`);
    }

    hook = mod.default;
    cache.set(hookFile, hook);
  }

  try {
    await hook(req, res, ctx);
  } catch (error) {
    if (error instanceof HookError) {
      throw error;
    }
    throw new HookError(`hook failed: ${toErrorMessage(error)}`, { cause: error });
  }
}

export function clearHookCache(): void {
  cache.clear();
  hookVersion += 1;
}

async function prepareHookImport(hookFile: string, version: number): Promise<string> {
  const cacheDir = resolve(process.cwd(), '.smocky-cache', 'hooks');
  await mkdir(cacheDir, { recursive: true });
  const extension = extname(hookFile);
  const baseName = basename(hookFile, extension).replace(/[^A-Za-z0-9_-]/g, '_');
  const sourceId = hashPath(hookFile);
  const targetPath = resolve(cacheDir, `${baseName}.${sourceId}.${version}${extension}`);
  await copyFile(hookFile, targetPath);

  if (version > 0) {
    const previousPath = resolve(cacheDir, `${baseName}.${sourceId}.${version - 1}${extension}`);
    await rm(previousPath, { force: true });
  }

  return targetPath;
}

function hashPath(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
