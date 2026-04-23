import { resolve } from 'node:path';

import { runScaffold } from '../init/scaffold';
import { runFromOpenapi } from '../init/from-openapi';

export interface InitOptions {
  fromOpenapi?: string;
  headers: string[];
  force: boolean;
  cwd: string;
  yes: boolean;
  name?: string;
  port?: number;
  examples?: boolean;
  helpers?: boolean;
  db?: boolean;
  tsconfig?: boolean;
}

export async function runInit(opts: InitOptions): Promise<number> {
  const targetDir = resolve(process.cwd(), opts.cwd);

  if (opts.fromOpenapi) {
    return runFromOpenapi({
      source: opts.fromOpenapi,
      headers: parseHeaders(opts.headers),
      force: opts.force,
      cwd: targetDir,
      yes: opts.yes,
    });
  }

  return runScaffold({
    force: opts.force,
    cwd: targetDir,
    yes: opts.yes,
    name: opts.name,
    port: opts.port,
    examples: opts.examples,
    helpers: opts.helpers,
    db: opts.db,
    tsconfig: opts.tsconfig,
  });
}

function parseHeaders(input: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of input) {
    const idx = entry.indexOf(':');
    if (idx === -1) {
      console.warn(`[smocky] ignoring malformed --header (expected "Name: value"): ${entry}`);
      continue;
    }
    const name = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    if (name) headers[name] = value;
  }
  return headers;
}
