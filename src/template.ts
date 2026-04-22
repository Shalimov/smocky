import type { Ctx, Helper } from './types';

const TOKEN = /{{\s*([\s\S]+?)\s*}}/g;
const ESCAPED_OPEN = /\{\\\{/g;
const OPEN_PLACEHOLDER = '\u0001SMOCKER_OPEN\u0001';
const ARGUMENT = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

export interface Engine {
  render(value: unknown, ctx: Ctx): Promise<unknown>;
}

export class TemplateError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TemplateError';
  }
}

export function createEngine(helpers: Map<string, Helper>): Engine {
  return {
    async render(value: unknown, ctx: Ctx): Promise<unknown> {
      return renderValue(value, ctx, helpers);
    },
  };
}

async function renderValue(value: unknown, ctx: Ctx, helpers: Map<string, Helper>): Promise<unknown> {
  if (typeof value === 'string') {
    return renderString(value, ctx, helpers);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => renderValue(item, ctx, helpers)));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = await renderValue(child, ctx, helpers);
    }
    return output;
  }

  return value;
}

async function renderString(value: string, ctx: Ctx, helpers: Map<string, Helper>): Promise<unknown> {
  const escaped = value.replace(ESCAPED_OPEN, OPEN_PLACEHOLDER);
  const matches = [...escaped.matchAll(TOKEN)];
  if (matches.length === 0) {
    return restoreEscapes(escaped);
  }

  if (matches.length === 1 && matches[0]?.[0] === escaped.trim()) {
    const resolved = await resolveExpression(matches[0][1] ?? '', ctx, helpers);
    return resolved === undefined ? null : resolved;
  }

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    output += escaped.slice(cursor, index);
    const resolved = await resolveExpression(match[1] ?? '', ctx, helpers);
    output += resolved === undefined ? '' : String(resolved);
    cursor = index + match[0].length;
  }

  output += escaped.slice(cursor);
  return restoreEscapes(output);
}

async function resolveExpression(
  expression: string,
  ctx: Ctx,
  helpers: Map<string, Helper>,
): Promise<unknown> {
  const { head, args } = tokenizeExpression(expression);

  if (head.startsWith('req.')) {
    return resolveRequestPath(head.slice(4), ctx);
  }

  if (head === 'req') {
    return ctx.req;
  }

  if (head.startsWith('db.') || head === 'db') {
    throw new TemplateError('db.* is reserved (Phase 2)');
  }

  const helper = helpers.get(head);
  if (!helper) {
    throw new TemplateError(`unknown helper "${head}"`);
  }

  try {
    return await helper(...args);
  } catch (error) {
    throw new TemplateError(`helper "${head}" failed: ${toErrorMessage(error)}`, {
      cause: error,
    });
  }
}

function tokenizeExpression(expression: string): { head: string; args: string[] } {
  const tokens: string[] = [];
  for (const match of expression.matchAll(ARGUMENT)) {
    const token = match[1] ?? match[2] ?? match[3];
    if (token !== undefined) {
      tokens.push(unescapeToken(token));
    }
  }

  const [head, ...args] = tokens;
  if (!head) {
    throw new TemplateError('empty template expression');
  }

  return { head, args };
}

function resolveRequestPath(path: string, ctx: Ctx): unknown {
  if (path === 'method') {
    return ctx.req.method;
  }
  if (path === 'path') {
    return ctx.req.path;
  }

  const segments = path.split('.').filter(Boolean);
  const [namespace, ...rest] = segments;

  switch (namespace) {
    case 'params':
      return readPath(ctx.req.params, rest);
    case 'query':
      return readPath(ctx.req.query, rest);
    case 'headers':
      if (rest.length === 0) {
        return ctx.req.headers;
      }
      return ctx.req.headers[rest.join('.').toLowerCase()];
    case 'body':
      return readPath(ctx.req.body, rest);
    default:
      return undefined;
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function restoreEscapes(value: string): string {
  return value.replaceAll(OPEN_PLACEHOLDER, '{{');
}

function unescapeToken(value: string): string {
  return value.replace(/\\([\\'\"])/g, '$1');
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
