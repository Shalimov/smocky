import jsf from 'json-schema-faker';

import type {
  OpenApiOperation,
  OpenApiSpec,
  OperationDescriptor,
} from '../../checker/types';
import { listOperations } from '../../checker/utils';

jsf.option({
  alwaysFakeOptionals: true,
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

    if (media.schema) {
      const fromProperties = generateBodyFromSchema(media.schema);
      if (fromProperties !== undefined && hasContent(fromProperties)) {
        return fromProperties;
      }
    }
  }

  if (strategy.useFaker && media.schema) {
    try {
      const generated = jsf.generate(media.schema as object);
      if (generated !== undefined && hasContent(generated)) {
        return generated;
      }
    } catch (err) {
      plan.warnings.push(
        `! ${desc.method} ${desc.path}: schema generation failed (${err instanceof Error ? err.message : String(err)}), fallback to required skeleton`,
      );
    }
  }

  if (media.schema) {
    const skeleton = generateRequiredSkeleton(media.schema);
    if (skeleton !== undefined && hasContent(skeleton)) {
      return skeleton;
    }
  }

  return {};
}

function hasContent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function generateBodyFromSchema(schema: Record<string, unknown>): unknown {
  const allOf = schema.allOf as Record<string, unknown>[] | undefined;
  if (allOf && allOf.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const sub of allOf) {
      const subResult = generateBodyFromSchema(sub);
      if (subResult && typeof subResult === 'object' && !Array.isArray(subResult)) {
        Object.assign(merged, subResult);
      }
    }
    if (Object.keys(merged).length > 0) return merged;
  }

  const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
  if (oneOf && oneOf.length > 0) {
    const body = generateBodyFromSchema(oneOf[0]!);
    if (body !== undefined) return body;
  }

  const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
  if (anyOf && anyOf.length > 0) {
    const body = generateBodyFromSchema(anyOf[0]!);
    if (body !== undefined) return body;
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  const type = schema.type;

  if (type === 'object' || schema.properties) {
    return walkObjectSchema(schema);
  }

  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items) {
      const item = generateBodyFromSchema(items);
      if (item !== undefined) return [item];
    }
    return [];
  }

  return undefined;
}

function walkObjectSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return {};

  const result: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as Record<string, unknown>;
    const value = generateBodyFromSchema(propSchema);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function generateRequiredSkeleton(schema: Record<string, unknown>): unknown {
  const result = collectOwnRequired(schema);

  const type = schema.type;

  if (type === 'array' && schema.items) {
    const item = generateRequiredSkeleton(schema.items as Record<string, unknown>);
    if (item !== undefined) return [item];
    return [];
  }

  if (result && Object.keys(result).length > 0) return result;

  return undefined;
}

function collectOwnRequired(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};

  const allOf = schema.allOf as Record<string, unknown>[] | undefined;
  if (allOf && allOf.length > 0) {
    for (const sub of allOf) {
      const subResult = collectOwnRequired(sub);
      if (subResult && typeof subResult === 'object' && !Array.isArray(subResult)) {
        Object.assign(merged, subResult);
      }
    }
  } else {
    const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
    if (oneOf && oneOf.length > 0) {
      const sub = collectOwnRequired(oneOf[0] ?? {});
      if (sub) Object.assign(merged, sub);
    } else {
      const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
      if (anyOf && anyOf.length > 0) {
        const sub = collectOwnRequired(anyOf[0] ?? {});
        if (sub) Object.assign(merged, sub);
      }
    }
  }

  if (schema.type === 'object' || schema.properties) {
    const properties = schema.properties as Record<string, unknown> | undefined;
    if (properties) {
      const required = new Set<string>(
        Array.isArray(schema.required) ? (schema.required as string[]) : [],
      );
      for (const key of required) {
        if (!(key in merged)) {
          const prop = properties[key] as Record<string, unknown> | undefined;
          if (prop) {
            merged[key] = primitiveDefault(prop.type as string | undefined);
          }
        }
      }
    }
  }

  return merged;
}

function primitiveDefault(type?: string): unknown {
  switch (type) {
    case 'string':  return 'string';
    case 'integer':
    case 'number':  return 0;
    case 'boolean': return false;
    case 'array':   return [];
    case 'object':  return {};
    default:        return null;
  }
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
