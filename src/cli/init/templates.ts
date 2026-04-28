import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// src/cli/init -> ../../.. = repo root, where templates/ lives
const TEMPLATES_ROOT = resolve(HERE, '../../..', 'examples', 'templates');

interface WriteFileOpts {
  force?: boolean;
}

type WriteOutcome = 'wrote' | 'skipped' | 'overwrote';

export interface WriteResult {
  path: string;
  outcome: WriteOutcome;
}

/** Render a template file: read it from templates root and substitute {{vars}}. */
export async function renderTemplate(
  relativePath: string,
  vars: Record<string, string> = {},
): Promise<string> {
  const abs = join(TEMPLATES_ROOT, relativePath);
  const raw = await readFile(abs, 'utf8');
  return interpolate(raw, vars);
}

/** Write a string to disk, respecting skip-if-exists semantics. */
export async function writeFileSafe(
  destPath: string,
  contents: string,
  opts: WriteFileOpts = {},
): Promise<WriteResult> {
  const exists = await pathExists(destPath);
  if (exists && !opts.force) {
    return { path: destPath, outcome: 'skipped' };
  }
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, contents, 'utf8');
  return { path: destPath, outcome: exists ? 'overwrote' : 'wrote' };
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function interpolate(text: string, vars: Record<string, string>): string {
  // Use <%var%> so we don't collide with smocky's runtime {{...}} syntax.
  return text.replace(/<%\s*([A-Za-z0-9_]+)\s*%>/g, (_match, key: string) => {
    return key in vars ? vars[key]! : `<%${key}%>`;
  });
}
