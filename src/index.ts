import { Smocky } from './smocky';
import type { RecordConfig, SmockyOptions } from './types';

export { Smocky } from './smocky';
export type { SmockyHandle } from './smocky';
export { defineConfig } from './config';
export type {
  Config,
  Ctx,
  Helper,
  Hook,
  MockRequest,
  MockResponse,
  SmockyOptions,
} from './types';

export interface ServerHandle {
  port: number;
  url: string;
  stop(): Promise<void>;
}

export interface StartOptions {
  config?: string;
  port?: number;
  baseUrl?: string;
  record?: boolean | RecordConfig;
}

export async function startServer(opts: StartOptions = {}): Promise<ServerHandle> {
  const smockyOpts: SmockyOptions = {
    config: opts.config,
    port: opts.port,
    baseUrl: opts.baseUrl,
    record:
      opts.record !== undefined
        ? typeof opts.record === 'boolean'
          ? { enabled: opts.record }
          : opts.record
        : undefined,
  };

  const instance = await Smocky.start(smockyOpts);

  return {
    port: instance.port,
    url: instance.url,
    stop: () => instance.stop(),
  };
}
