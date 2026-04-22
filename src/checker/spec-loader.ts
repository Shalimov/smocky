import $RefParser from '@apidevtools/json-schema-ref-parser';
import { resolve } from 'node:path';

import type { OpenApiSpec } from './types';

export async function loadSpec(specPath: string): Promise<OpenApiSpec> {
  const target = isUrl(specPath) ? specPath : resolve(process.cwd(), specPath);
  const dereferenced = await $RefParser.dereference(target);
  return dereferenced as OpenApiSpec;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
