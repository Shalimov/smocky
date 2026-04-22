import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import jsf from 'json-schema-faker';

import type {
  LoadedSampleOverrides,
  OpenApiParameter,
  OperationDescriptor,
  OperationSample,
} from './types';
import { getJsonSchema } from './utils';

jsf.option({
  alwaysFakeOptionals: true,
  useDefaultValue: true,
  useExamplesValue: true,
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
});

export async function loadSampleOverrides(sampleDataPath?: string): Promise<LoadedSampleOverrides> {
  if (!sampleDataPath) {
    return { byOperationId: {}, byMethodPath: {} };
  }

  const absolutePath = resolve(process.cwd(), sampleDataPath);
  try {
    await access(absolutePath);
  } catch {
    return { byOperationId: {}, byMethodPath: {} };
  }

  const raw = await readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const byOperationId: Record<string, unknown> = {};
  const byMethodPath: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (/^[A-Z]+\s+\//.test(key)) {
      byMethodPath[key] = value;
    } else {
      byOperationId[key] = value;
    }
  }

  return { byOperationId, byMethodPath };
}

export function generateOperationSample(
  descriptor: OperationDescriptor,
  overrides: LoadedSampleOverrides,
): OperationSample {
  const pathParams = generateParameters(descriptor.parameters, 'path');
  const queryParams = generateParameters(descriptor.parameters, 'query');
  const bodySchema = getJsonSchema(descriptor.operation.requestBody?.content);

  let body: unknown;
  let skippedReason: string | undefined;

  const override = lookupOverride(descriptor, overrides);
  if (override !== undefined) {
    body = structuredClone(override);
  } else if (bodySchema) {
    try {
      body = jsf.generate(bodySchema);
    } catch {
      if (descriptor.operation.requestBody?.required) {
        skippedReason = 'no sample data available';
      }
    }
  } else if (descriptor.operation.requestBody?.required) {
    skippedReason = 'no sample data available';
  }

  return { pathParams, queryParams, body, skippedReason };
}

function lookupOverride(
  descriptor: OperationDescriptor,
  overrides: LoadedSampleOverrides,
): unknown {
  if (descriptor.operation.operationId && descriptor.operation.operationId in overrides.byOperationId) {
    return overrides.byOperationId[descriptor.operation.operationId];
  }

  const methodPathKey = `${descriptor.method} ${descriptor.path}`;
  return overrides.byMethodPath[methodPathKey];
}

function generateParameters(parameters: OpenApiParameter[], location: OpenApiParameter['in']): Record<string, string> {
  const values: Record<string, string> = {};

  for (const parameter of parameters.filter((candidate) => candidate.in === location)) {
    const schema = parameter.schema;
    const generated = generateParameterValue(schema);
    if (generated !== undefined) {
      values[parameter.name] = generated;
    }
  }

  return values;
}

function generateParameterValue(schema?: Record<string, unknown>): string | undefined {
  if (!schema) {
    return undefined;
  }

  try {
    const generated = jsf.generate(schema);
    return generated === undefined || generated === null ? undefined : String(generated);
  } catch {
    return undefined;
  }
}
