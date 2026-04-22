import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const cache = new WeakMap<object, ValidateFunction>();

export interface Mismatch {
  path: string;
  message: string;
  keyword: string;
}

export function validate(schema: object, value: unknown): Mismatch[] {
  const validator = getValidator(schema);
  if (validator(value)) {
    return [];
  }

  return (validator.errors ?? []).map(toMismatch);
}

function getValidator(schema: object): ValidateFunction {
  const cached = cache.get(schema);
  if (cached) {
    return cached;
  }

  const compiled = ajv.compile(schema);
  cache.set(schema, compiled);
  return compiled;
}

function toMismatch(error: ErrorObject): Mismatch {
  const path = error.instancePath || '/';
  return {
    path,
    message: `${error.instancePath || '<root>'} ${error.message}`.trim(),
    keyword: error.keyword,
  };
}
