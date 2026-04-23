import { basename, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import * as p from '@clack/prompts';

import {
  pathExists,
  renderTemplate,
  writeFileSafe,
  type WriteResult,
} from './templates';

export interface ScaffoldOptions {
  cwd: string;
  force: boolean;
  yes: boolean;
  name?: string;
  port?: number;
  examples?: boolean;
  helpers?: boolean;
  db?: boolean;
  tsconfig?: boolean;
}

interface Resolved {
  projectName: string;
  port: number;
  includeExamples: boolean;
  includeHelpers: boolean;
  includeDb: boolean;
  includeTsconfig: boolean;
}

export async function runScaffold(opts: ScaffoldOptions): Promise<number> {
  p.intro('smocker init');

  const configPath = join(opts.cwd, 'smocker.config.ts');
  const configExists = await pathExists(configPath);
  if (configExists && !opts.force) {
    p.note(
      `Found existing ${basename(configPath)}. New files will be added; existing files will be skipped.\nUse --force to overwrite.`,
      'Existing project detected',
    );
  }

  const resolved = await resolveAnswers(opts);

  const vars = {
    projectName: resolved.projectName,
    port: String(resolved.port),
  };

  const results: WriteResult[] = [];
  const spinner = p.spinner();
  spinner.start('Writing files');

  results.push(
    await writeRenderedFile('smocker.config.ts.tmpl', configPath, vars, opts.force),
  );

  if (resolved.includeExamples) {
    results.push(
      await writeRenderedFile(
        'endpoints/health/response.json.tmpl',
        join(opts.cwd, 'endpoints/health/response.json'),
        vars,
        opts.force,
      ),
    );
    results.push(
      await writeRenderedFile(
        'endpoints/users/response.json.tmpl',
        join(opts.cwd, 'endpoints/users/response.json'),
        vars,
        opts.force,
      ),
    );
    results.push(
      await writeRenderedFile(
        'endpoints/users/_id/response.json.tmpl',
        join(opts.cwd, 'endpoints/users/_id/response.json'),
        vars,
        opts.force,
      ),
    );
  }

  if (resolved.includeHelpers) {
    results.push(
      await writeFileSafe(join(opts.cwd, 'helpers/.gitkeep'), '', { force: opts.force }),
    );
  }

  if (resolved.includeDb) {
    results.push(
      await writeRenderedFile(
        'db/users.json.tmpl',
        join(opts.cwd, 'db/users.json'),
        vars,
        opts.force,
      ),
    );
  }

  if (resolved.includeTsconfig) {
    const tsPath = join(opts.cwd, 'tsconfig.json');
    if (!(await pathExists(tsPath))) {
      results.push(
        await writeRenderedFile('tsconfig.json.tmpl', tsPath, vars, opts.force),
      );
    } else {
      results.push({ path: tsPath, outcome: 'skipped' });
    }
  }

  // Patch package.json if present, never create one.
  const pkgPath = join(opts.cwd, 'package.json');
  if (await pathExists(pkgPath)) {
    await patchPackageJson(pkgPath);
  }

  spinner.stop('Done');

  printSummary(results, opts.cwd);

  p.outro(
    `Next steps:\n  cd ${shortPath(opts.cwd)}\n  bun smocker serve\n\nTry it: curl http://localhost:${vars.port}/health`,
  );

  return 0;
}

async function resolveAnswers(opts: ScaffoldOptions): Promise<Resolved> {
  const defaults = {
    projectName: opts.name ?? basename(opts.cwd),
    port: opts.port ?? 4000,
    includeExamples: opts.examples ?? true,
    includeHelpers: opts.helpers ?? true,
    includeDb: opts.db ?? false,
    includeTsconfig: opts.tsconfig ?? true,
  };

  const interactive = !opts.yes && allFlagsMissing(opts) && Boolean(process.stdout.isTTY);

  if (!interactive) {
    return defaults;
  }

  const answers = await p.group(
    {
      projectName: () =>
        p.text({
          message: 'Project name',
          placeholder: defaults.projectName,
          defaultValue: defaults.projectName,
        }),
      port: () =>
        p.text({
          message: 'Server port',
          placeholder: String(defaults.port),
          defaultValue: String(defaults.port),
          validate: (value) => {
            const n = Number(value);
            if (!Number.isInteger(n) || n <= 0 || n > 65535) {
              return 'Enter an integer between 1 and 65535';
            }
            return undefined;
          },
        }),
      includeExamples: () =>
        p.confirm({
          message: 'Include example endpoints (/health, /users, /users/:id)?',
          initialValue: defaults.includeExamples,
        }),
      includeHelpers: () =>
        p.confirm({
          message: 'Include helpers/ folder?',
          initialValue: defaults.includeHelpers,
        }),
      includeDb: () =>
        p.confirm({
          message: 'Include db/ seed folder?',
          initialValue: defaults.includeDb,
        }),
      includeTsconfig: () =>
        p.confirm({
          message: 'Write tsconfig.json (skipped if one already exists)?',
          initialValue: defaults.includeTsconfig,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Aborted.');
        process.exit(0);
      },
    },
  );

  return {
    projectName: String(answers.projectName ?? defaults.projectName),
    port: Number(answers.port ?? defaults.port),
    includeExamples: Boolean(answers.includeExamples),
    includeHelpers: Boolean(answers.includeHelpers),
    includeDb: Boolean(answers.includeDb),
    includeTsconfig: Boolean(answers.includeTsconfig),
  };
}

function allFlagsMissing(opts: ScaffoldOptions): boolean {
  return (
    opts.name === undefined &&
    opts.port === undefined &&
    opts.examples === undefined &&
    opts.helpers === undefined &&
    opts.db === undefined &&
    opts.tsconfig === undefined
  );
}

async function writeRenderedFile(
  templateRel: string,
  destPath: string,
  vars: Record<string, string>,
  force: boolean,
): Promise<WriteResult> {
  const contents = await renderTemplate(templateRel, vars);
  return writeFileSafe(destPath, contents, { force });
}

async function patchPackageJson(pkgPath: string): Promise<void> {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    pkg.scripts ??= {};
    if (!pkg.scripts.mock) {
      pkg.scripts.mock = 'smocker serve';
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      p.log.info('Added "mock": "smocker serve" script to package.json');
    }
  } catch (err) {
    p.log.warn(
      `Could not patch package.json (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

function printSummary(results: WriteResult[], cwd: string): void {
  const lines: string[] = [];
  for (const r of results) {
    const rel = relativeFrom(cwd, r.path);
    if (r.outcome === 'wrote') lines.push(`  + ${rel}`);
    else if (r.outcome === 'overwrote') lines.push(`  ! ${rel}`);
    else lines.push(`  - ${rel} (skipped)`);
  }
  p.note(lines.join('\n') || '  (no files written)', 'Files');
}

function relativeFrom(base: string, target: string): string {
  return target.startsWith(base) ? target.slice(base.length + 1) : target;
}

function shortPath(target: string): string {
  return target === process.cwd() ? '.' : target;
}
