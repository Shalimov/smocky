import { afterEach, describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { loadConfig } from '../src/config';
import { withTempDir, writeText } from './test-utils';

const ORIGINAL_ENV = {
  PORT: process.env.PORT,
  BASE_URL: process.env.BASE_URL,
  RECORD: process.env.RECORD,
};

afterEach(() => {
  restoreEnv();
});

describe('loadConfig', () => {
  test('returns defaults when the config file does not exist', async () => {
    await withTempDir('smocker-config-missing', async (dir) => {
      const config = await loadConfig(join(dir, 'missing.config.ts'));

      expect(config.port).toBe(3000);
      expect(config.baseUrl).toBe('');
      expect(config.endpointsDir).toBe(resolve(process.cwd(), 'endpoints'));
      expect(config.helpersDir).toBe(resolve(process.cwd(), 'helpers'));
      expect(config.record.enabled).toBe(false);
      expect(config.record.outputDir).toBe(resolve(process.cwd(), 'endpoints'));
    });
  });

  test('merges config, lowercases global headers, applies env overrides, and resolves active config sections', async () => {
    await withTempDir('smocker-config-merge', async (dir) => {
      const configPath = join(dir, 'mock.config.ts');
      const endpointsDir = join(dir, 'api-mocks');
      const helpersDir = join(dir, 'helpers-src');
      await writeText(
        configPath,
        `export default {
  port: 1234,
  baseUrl: 'https://file.example.com',
  endpointsDir: ${JSON.stringify(endpointsDir)},
  helpersDir: ${JSON.stringify(helpersDir)},
  globalHeaders: {
    'X-Test': 'ok'
  },
  record: {
    include: ['/api'],
    exclude: [/^\\/api\\/private/],
    overwrite: true
  },
  db: { persist: true },
  openapi: { spec: './openapi.json' }
};\n`,
      );

      process.env.PORT = '4567';
      process.env.BASE_URL = 'https://env.example.com';
      process.env.RECORD = 'true';

      const config = await loadConfig(configPath);

      expect(config.port).toBe(4567);
      expect(config.baseUrl).toBe('https://env.example.com');
      expect(config.endpointsDir).toBe(endpointsDir);
      expect(config.helpersDir).toBe(helpersDir);
      expect(config.globalHeaders).toEqual({ 'x-test': 'ok' });
      expect(config.record.enabled).toBe(true);
      expect(config.record.outputDir).toBe(endpointsDir);
      expect(config.record.include).toEqual(['/api']);
      expect(config.record.exclude).toHaveLength(1);
      expect(config.record.exclude[0]).toBeInstanceOf(RegExp);
      expect(config.record.overwrite).toBe(true);
      expect(config.db.persist).toBe(true);
      expect(config.openapi?.spec).toBe(resolve(process.cwd(), 'openapi.json'));
    });
  });

  test('throws on invalid baseUrl', async () => {
    await withTempDir('smocker-config-invalid', async (dir) => {
      const configPath = join(dir, 'mock.config.ts');
      await writeText(
        configPath,
        `export default {
  baseUrl: 'not a url'
};\n`,
      );

      await expect(loadConfig(configPath)).rejects.toThrow('invalid baseUrl');
    });
  });
});

function restoreEnv(): void {
  process.env.PORT = ORIGINAL_ENV.PORT;
  process.env.BASE_URL = ORIGINAL_ENV.BASE_URL;
  process.env.RECORD = ORIGINAL_ENV.RECORD;
}
