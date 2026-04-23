import jsf from 'json-schema-faker';

import type {
  OpenApiOperation,
  OpenApiSpec,
  OperationDescriptor,
} from '../../checker/types';
import { listOperations } from '../../checker/utils';

jsf.option({
  alwaysFakeOptionals: false,
  useDefaultValue: true,
  useExamplesValue: true,
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
});

export interface EndpointPlan {
  /** OpenAPI path, e.g. "/users/{id}". */
  specPath: string;
  /** Folder path relative to endpointsDir, e.g. "users/_id". */
  folderPath: string;
  methodBlocks: Record<string, MethodBlock>;
  /** Tags that produced this endpoint (for grouping in the wizard). */
  tags: string[];
  /** operationId(s) for friendly display. */
  operationIds: string[];
  warnings: string[];
}

export interface MethodBlock {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface BodyStrategy {
  useExamples: boolean;
  useFaker: boolean;
  emptyForUnsupported: boolean;
}

export interface PlanOptions {
  spec: OpenApiSpec;
  selected: OperationDescriptor[];
  strategy: BodyStrategy;
}

export interface PlanResult {
  plans: EndpointPlan[];
  /** Cross-cutting warnings (e.g. unsupported content types). */
  warnings: string[];
}

/** Convert spec path "/users/{id}" -> "users/_id". Returns null if unrenderable. */
export function specPathToFolder(specPath: string): string | null {
  const segments = specPath.split('/').filter(Boolean);
  const out: string[] = [];
  for (const seg of segments) {
    const m = seg.match(/^\{([A-Za-z][A-Za-z0-9_]*)\}$/);
    if (m) {
      out.push(`_${m[1]}`);
    } else if (/^[A-Za-z0-9._\-]+$/.test(seg)) {
      out.push(seg);
    } else {
      return null;
    }
  }
  return out.join('/');
}

export function planEndpoints(opts: PlanOptions): PlanResult {
  const byFolder = new Map<string, EndpointPlan>();
  const warnings: string[] = [];

  for (const desc of opts.selected) {
    const folder = specPathToFolder(desc.path);
    if (!folder) {
      warnings.push(`! ${desc.method} ${desc.path}: unsupported path segments, skipped`);
      continue;
    }

    let plan = byFolder.get(folder);
    if (!plan) {
      plan = {
        specPath: desc.path,
        folderPath: folder,
        methodBlocks: {},
        tags: [],
        operationIds: [],
        warnings: [],
      };
      byFolder.set(folder, plan);
    }

    const tagList = (desc.operation.tags as string[] | undefined) ?? [];
    for (const tag of tagList) if (!plan.tags.includes(tag)) plan.tags.push(tag);
    if (desc.operation.operationId) plan.operationIds.push(desc.operation.operationId);

    const block = buildMethodBlock(desc, opts.strategy, plan);
    if (block) {
      plan.methodBlocks[desc.method.toUpperCase()] = block;
    }
  }

  return { plans: [...byFolder.values()], warnings };
}

function buildMethodBlock(
  desc: OperationDescriptor,
  strategy: BodyStrategy,
  plan: EndpointPlan,
): MethodBlock | null {
  const op = desc.operation;
  const responses = op.responses ?? {};
  const responseKey = pickResponseKey(Object.keys(responses));
  if (!responseKey) {
    plan.warnings.push(`! ${desc.method} ${desc.path}: no responses defined`);
    if (strategy.emptyForUnsupported) {
      return { status: 200, body: {} };
    }
    return null;
  }

  const status = parseStatus(responseKey);
  const response = responses[responseKey]!;
  const content = response.content ?? {};

  // Prefer application/json; fall back to first available content type.
  const json = content['application/json'];
  if (json) {
    const body = generateBody(json, strategy, desc, plan);
    return { status, body };
  }

  const otherTypes = Object.keys(content);
  if (otherTypes.length === 0) {
    return { status, body: {} };
  }

  // Non-JSON content (e.g. text/plain). Use example if any, else empty string.
  const first = content[otherTypes[0]!]!;
  const example =
    (first as { example?: unknown }).example ??
    pickFirstExample((first as { examples?: Record<string, { value?: unknown }> }).examples);

  if (example !== undefined) {
    return { status, body: example, headers: { 'content-type': otherTypes[0]! } };
  }

  plan.warnings.push(
    `! ${desc.method} ${desc.path}: only ${otherTypes[0]} response, body left empty`,
  );
  return { status, body: '', headers: { 'content-type': otherTypes[0]! } };
}

function generateBody(
  media: { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: Record<string, unknown> },
  strategy: BodyStrategy,
  desc: OperationDescriptor,
  plan: EndpointPlan,
): unknown {
  if (strategy.useExamples) {
    if (media.example !== undefined) return media.example;
    const fromExamples = pickFirstExample(media.examples);
    if (fromExamples !== undefined) return fromExamples;
  }

  if (strategy.useFaker && media.schema) {
    try {
      return jsf.generate(media.schema as object);
    } catch (err) {
      plan.warnings.push(
        `! ${desc.method} ${desc.path}: schema generation failed (${err instanceof Error ? err.message : String(err)}), body left as {}`,
      );
      return {};
    }
  }

  return {};
}

function pickFirstExample(examples?: Record<string, { value?: unknown }>): unknown {
  if (!examples) return undefined;
  for (const ex of Object.values(examples)) {
    if (ex && typeof ex === 'object' && 'value' in ex) return (ex as { value?: unknown }).value;
  }
  return undefined;
}

function pickResponseKey(keys: string[]): string | undefined {
  if (keys.includes('200')) return '200';
  if (keys.includes('201')) return '201';
  for (const k of keys) {
    if (/^2\d\d$/.test(k)) return k;
  }
  if (keys.includes('2XX')) return '2XX';
  if (keys.includes('default')) return 'default';
  return keys[0];
}

function parseStatus(key: string): number {
  if (/^\d{3}$/.test(key)) return Number(key);
  if (key === '2XX') return 200;
  return 200;
}

export function listOpsByTag(spec: OpenApiSpec): {
  tag: string;
  ops: OperationDescriptor[];
}[] {
  const ops = listOperations(spec);
  const groups = new Map<string, OperationDescriptor[]>();
  for (const op of ops) {
    const tags = ((op.operation as OpenApiOperation).tags as string[] | undefined) ?? [];
    if (tags.length === 0) {
      pushInto(groups, '(untagged)', op);
    } else {
      for (const tag of tags) pushInto(groups, tag, op);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, ops]) => ({ tag, ops }));
}

function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export function describeOperation(desc: OperationDescriptor): string {
  const opId = desc.operation.operationId ? `  (${desc.operation.operationId})` : '';
  const summary = desc.operation.summary ? ` — ${String(desc.operation.summary)}` : '';
  return `[${desc.method}] ${desc.path}${summary}${opId}`;
}
