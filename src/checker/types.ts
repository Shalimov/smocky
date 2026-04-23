import type { RecordRule } from '../types';
import type { Mismatch } from './validator';

export interface OpenApiMediaType {
  schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenApiOperation {
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, OpenApiMediaType>;
  };
  responses?: Record<string, {
    description?: string;
    content?: Record<string, OpenApiMediaType>;
  }>;
  [key: string]: unknown;
}

export interface OpenApiSpec {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface OperationDescriptor {
  method: string;
  path: string;
  operation: OpenApiOperation;
  parameters: OpenApiParameter[];
}

export type CheckStatus = 'ok' | 'mismatch' | 'error' | 'skipped' | 'missing' | 'undocumented';

export interface CheckResult {
  status: CheckStatus;
  issues: Mismatch[];
  note?: string;
  statusCode?: number;
  elapsedMs?: number;
}

export interface OpReport {
  method: string;
  path: string;
  api?: CheckResult;
  mock?: CheckResult;
}

export interface ReportTotals {
  checked: number;
  mismatches: number;
  warnings: number;
  skipped: number;
}

export interface Report {
  ops: OpReport[];
  totals: ReportTotals;
}

export interface LoadedSampleOverrides {
  byOperationId: Record<string, unknown>;
  byMethodPath: Record<string, unknown>;
}

export interface OperationSample {
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  body?: unknown;
  skippedReason?: string;
}
