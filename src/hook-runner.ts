import { pathToFileURL } from 'node:url';

import type { Ctx, Hook, MockRequest, MockResponse } from './types';

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

  const fileUrl = pathToFileURL(hookFile);

  let mod: { default?: Hook };
  try {
    mod = (await import(fileUrl.href)) as { default?: Hook };
  } catch (error) {
    throw new HookError(`failed to load hook "${hookFile}": ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof mod.default !== 'function') {
    throw new HookError(`hook "${hookFile}" must default-export a function`);
  }

  try {
    await mod.default(req, res, ctx);
  } catch (error) {
    if (error instanceof HookError) {
      throw error;
    }
    throw new HookError(`hook failed: ${toErrorMessage(error)}`, { cause: error });
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
