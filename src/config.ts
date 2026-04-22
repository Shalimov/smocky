import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Config, ResolvedConfig, ResolvedRecordConfig } from './types';

const DEFAULT_RECORD: ResolvedRecordConfig = {
  enabled: false,
  outputDir: './endpoints',
  include: [],
  exclude: [],
  overwrite: false,
};

const DEFAULTS = {
  port: 3000,
  baseUrl: '',
  endpointsDir: './endpoints',
  helpersDir: './helpers',
  globalHeaders: {},
};

export function defineConfig(config: Config): Config {
  return config;
}

export async function loadConfig(configPath?: string): Promise<ResolvedConfig> {
  const cwd = process.cwd();
  const absoluteConfigPath = resolve(cwd, configPath ?? './mock.config.ts');
  let userConfig: Config = {};

  try {
    await access(absoluteConfigPath);
    const module = (await import(pathToFileURL(absoluteConfigPath).href)) as {
      default?: Config;
    };
    userConfig = module.default ?? {};
  } catch (error) {
    if (await fileExists(absoluteConfigPath)) {
      throw error;
    }
  }

  const record = mergeRecordConfig(userConfig.record, userConfig.endpointsDir);
  const config: ResolvedConfig = {
    port: userConfig.port ?? DEFAULTS.port,
    baseUrl: userConfig.baseUrl ?? DEFAULTS.baseUrl,
    endpointsDir: resolve(cwd, userConfig.endpointsDir ?? DEFAULTS.endpointsDir),
    helpersDir: resolve(cwd, userConfig.helpersDir ?? DEFAULTS.helpersDir),
    globalHeaders: normalizeHeaders({
      ...DEFAULTS.globalHeaders,
      ...(userConfig.globalHeaders ?? {}),
    }),
    record,
    db: userConfig.db,
    openapi: userConfig.openapi,
  };

  applyEnvOverrides(config);
  config.record.outputDir = resolve(cwd, config.record.outputDir);
  validateConfig(config);

  if (config.db) {
    console.warn('[smocker] `db` config is reserved for Phase 2 and ignored in Phase 1.');
  }
  if (config.openapi) {
    console.warn('[smocker] `openapi` config is reserved for Phase 3 and ignored in Phase 1.');
  }

  return config;
}

function mergeRecordConfig(record: Config['record'], endpointsDir?: string): ResolvedRecordConfig {
  return {
    enabled: record?.enabled ?? DEFAULT_RECORD.enabled,
    outputDir: record?.outputDir ?? endpointsDir ?? DEFAULT_RECORD.outputDir,
    include: record?.include ? [...record.include] : [...DEFAULT_RECORD.include],
    exclude: record?.exclude ? [...record.exclude] : [...DEFAULT_RECORD.exclude],
    overwrite: record?.overwrite ?? DEFAULT_RECORD.overwrite,
  };
}

function applyEnvOverrides(config: ResolvedConfig): void {
  if (process.env.PORT) {
    config.port = Number(process.env.PORT);
  }
  if (process.env.BASE_URL) {
    config.baseUrl = process.env.BASE_URL;
  }
  if (process.env.RECORD === '1' || process.env.RECORD === 'true') {
    config.record.enabled = true;
  }
}

function validateConfig(config: ResolvedConfig): void {
  if (!Number.isInteger(config.port) || config.port <= 0) {
    throw new Error(`[smocker] invalid port: ${String(config.port)}`);
  }

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error(`[smocker] invalid baseUrl: ${config.baseUrl}`);
    }
  }
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
