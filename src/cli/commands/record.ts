import { startServer } from '../../index';
import { compareSnapshots, printSnapshotReport } from '../../snapshot';
import type { RecordConfig } from '../../types';

export interface RecordOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  exec?: string;
  to?: string;
  overwrite?: boolean;
  checkSnapshots?: string;
  updateSnapshots?: boolean;
}

export async function runRecord(opts: RecordOptions): Promise<number> {
  const outputDir = opts.to ?? './fixtures';

  const recordOverride: RecordConfig = {
    enabled: true,
    outputDir,
    fixturesDir: outputDir,
  };

  if (opts.overwrite !== undefined) {
    recordOverride.overwrite = opts.overwrite;
  }

  if (opts.updateSnapshots) {
    recordOverride.overwrite = true;
  }

  const handle = await startServer({
    config: opts.config,
    port: opts.port,
    baseUrl: opts.baseUrl,
    record: recordOverride,
  });

  console.log(`[smocky] recording to ${outputDir}`);
  console.log(`[smocky] server listening at ${handle.url}`);

  if (opts.exec) {
    console.log(`[smocky] running: ${opts.exec}`);

    const parts = parseCommand(opts.exec);
    if (parts.length === 0) {
      console.error('[smocky] --exec requires a non-empty command');
      await handle.stop();
      return 1;
    }
    const [command, ...args] = parts;

    const proc = Bun.spawn([command!, ...args], {
      env: {
        ...process.env,
        SMOCKY_URL: handle.url,
      },
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    const exitCode = await proc.exited;

    await handle.stop();
    console.log(`[smocky] recording finished (exit code: ${exitCode})`);

    if (opts.checkSnapshots) {
      await checkAndReportSnapshots(opts.checkSnapshots, outputDir, opts.updateSnapshots);
    }

    return exitCode;
  }

  console.log('[smocky] recording (Ctrl+C to stop)');
  await waitForSignal();
  await handle.stop();

  if (opts.checkSnapshots) {
    await checkAndReportSnapshots(opts.checkSnapshots, outputDir, opts.updateSnapshots);
  }

  console.log('[smocky] recording finished');
  return 0;
}

async function checkAndReportSnapshots(
  baselineDir: string,
  currentDir: string,
  _update: boolean | undefined,
): Promise<void> {
  console.log(`[smocky] comparing fixtures: ${currentDir} vs ${baselineDir}`);
  const report = await compareSnapshots(baselineDir, currentDir);
  printSnapshotReport(report);
}

function parseCommand(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

async function waitForSignal(): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      process.removeListener('SIGINT', handler);
      process.removeListener('SIGTERM', handler);
      resolve();
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  });
}
