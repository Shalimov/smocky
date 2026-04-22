export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body: unknown;
  raw: Request;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay: number;
}

export interface Ctx {
  req: MockRequest;
}

export type Hook = (
  req: MockRequest,
  res: MockResponse,
  ctx: Ctx,
) => void | Promise<void>;

export type Helper = (...args: string[]) => unknown | Promise<unknown>;

export type RecordRule = string | RegExp;

export interface RecordConfig {
  enabled?: boolean;
  outputDir?: string;
  include?: RecordRule[];
  exclude?: RecordRule[];
  overwrite?: boolean;
}

export interface ResolvedRecordConfig {
  enabled: boolean;
  outputDir: string;
  include: RecordRule[];
  exclude: RecordRule[];
  overwrite: boolean;
}

export interface DbConfig {
  dir?: string;
  persist?: boolean;
  autoId?: 'uuid';
}

export interface OpenApiConfig {
  spec: string;
  check?: {
    timeout?: number;
    auth?: { headers?: Record<string, string> };
    skipPaths?: RecordRule[];
    sampleData?: string;
    failOnMismatch?: boolean;
  };
}

export interface Config {
  port?: number;
  baseUrl?: string;
  endpointsDir?: string;
  helpersDir?: string;
  globalHeaders?: Record<string, string>;
  record?: RecordConfig;
  db?: DbConfig;
  openapi?: OpenApiConfig;
}

export interface ResolvedConfig {
  port: number;
  baseUrl: string;
  endpointsDir: string;
  helpersDir: string;
  globalHeaders: Record<string, string>;
  record: ResolvedRecordConfig;
  db?: DbConfig;
  openapi?: OpenApiConfig;
}

export interface ResponseMethodBlock {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delay?: number;
}

export interface ResponseDefinition {
  [method: string]: ResponseMethodBlock;
}
