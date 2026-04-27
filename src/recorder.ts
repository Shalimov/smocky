import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ResolvedRecordConfig, ResponseDefinition } from './types';

export interface Recorder {
  shouldRecord(path: string): boolean;
  record(req: Request, res: Response): Promise<void>;
}

export function createRecorder(cfg: ResolvedRecordConfig): Recorder {
  return {
    shouldRecord(pathname: string): boolean {
      if (!cfg.enabled) {
        return false;
      }
      if (matches(pathname, cfg.exclude)) {
        return false;
      }
      if (cfg.include.length > 0 && !matches(pathname, cfg.include)) {
        return false;
      }
      return true;
    },

    async record(req: Request, res: Response): Promise<void> {
      if (!cfg.enabled) {
        return;
      }

      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        return;
      }

      if (!this.shouldRecord(url.pathname)) {
        log('skipped', req.method.toUpperCase(), url.pathname, 'filter');
        return;
      }

      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json')) {
        log('skipped', req.method.toUpperCase(), url.pathname, 'non-json body');
        return;
      }

      let body: unknown;
      try {
        body = await res.clone().json();
      } catch {
        log('skipped', req.method.toUpperCase(), url.pathname, 'invalid json body');
        return;
      }

      const folder = pathToFolder(url.pathname, cfg.outputDir);
      const filePath = join(folder, 'response.json');
      try {
        await mkdir(folder, { recursive: true });
      } catch (error) {
        console.warn(`[recorder] failed to create directory ${folder}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      const existing = await readExistingDefinition(filePath);
      const method = req.method.toUpperCase();
      if (existing[method] && !cfg.overwrite) {
        log('kept', method, url.pathname, 'overwrite=false');
        return;
      }

      existing[method] = {
        status: res.status,
        headers: pickRelevantHeaders(res.headers),
        body,
      };

      try {
        await writeFile(filePath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
      } catch (error) {
        console.warn(`[recorder] failed to write ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      log('saved', method, url.pathname, filePath);
    },
  };
}

function matches(pathname: string, rules: Array<string | RegExp>): boolean {
  for (const rule of rules) {
    if (typeof rule === 'string' && pathname.startsWith(rule)) {
      return true;
    }
    if (rule instanceof RegExp && rule.test(pathname)) {
      return true;
    }
  }
  return false;
}

function pathToFolder(pathname: string, root: string): string {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const safeParts: string[] = [];
  for (const part of parts) {
    if (part === '..' || part === '.' || part.startsWith('~')) {
      continue;
    }
    safeParts.push(part);
  }
  return resolve(root, ...safeParts);
}

async function readExistingDefinition(filePath: string): Promise<ResponseDefinition> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as ResponseDefinition;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    console.warn(`[recorder] failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function pickRelevantHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'content-type' || lowerKey === 'cache-control' || lowerKey.startsWith('x-')) {
      output[lowerKey] = value;
    }
  });
  return output;
}

function log(action: string, method: string, pathname: string, detail: string): void {
  console.log(`[recorder] ${action.padEnd(7, ' ')} ${method.padEnd(6, ' ')} ${pathname} -> ${detail}`);
}
