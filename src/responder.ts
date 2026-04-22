import { HookError, runHook } from './hook-runner';
import type { Db } from './db';
import type { MatchResult } from './router';
import { TemplateError, type Engine } from './template';
import type {
  Ctx,
  MockRequest,
  MockResponse,
  ResolvedConfig,
  ResponseDefinition,
  ResponseMethodBlock,
} from './types';

export interface Responder {
  respond(match: MatchResult, req: MockRequest): Promise<Response>;
}

export async function resolveMockResponse(
  match: MatchResult,
  req: MockRequest,
  engine: Engine,
  db?: Db,
): Promise<MockResponse | null> {
  const definition = (await Bun.file(match.route.responseFile).json()) as ResponseDefinition;
  const block = getMethodBlock(definition, req.method);
  if (!block) {
    return null;
  }

  const res: MockResponse = {
    status: block.status ?? 200,
    headers: normalizeHeaders(block.headers ?? {}),
    body: block.body ?? {},
    delay: Math.max(0, block.delay ?? 0),
  };
  const ctx: Ctx = { req, db };

  res.body = await engine.render(res.body, ctx);
  res.headers = await renderHeaders(res.headers, engine, ctx);

  await runHook(match.route.hookFile, req, res, ctx);
  return res;
}

export function createResponder(cfg: ResolvedConfig, engine: Engine, db?: Db): Responder {
  return {
    async respond(match: MatchResult, req: MockRequest): Promise<Response> {
      try {
        const res = await resolveMockResponse(match, req, engine, db);
        if (!res) {
          return methodNotAllowed(match, req.method);
        }

        const finalHeaders = {
          ...cfg.globalHeaders,
          ...normalizeHeaders(res.headers),
        };

        if (res.delay > 0) {
          await Bun.sleep(res.delay);
        }

        return toResponse(req.method, res, finalHeaders);
      } catch (error) {
        return errorResponse(error, match, req.method);
      }
    },
  };
}

export async function buildMockRequest(
  raw: Request,
  params: Record<string, string>,
): Promise<MockRequest> {
  const url = new URL(raw.url);
  return {
    method: raw.method.toUpperCase(),
    path: url.pathname,
    params,
    query: parseQuery(url.searchParams),
    headers: headersToObject(raw.headers),
    body: await tryReadBody(raw.clone()),
    raw,
  };
}

function getMethodBlock(definition: ResponseDefinition, method: string): ResponseMethodBlock | undefined {
  return definition[method] ?? definition[method.toUpperCase()] ?? definition[method.toLowerCase()];
}

async function renderHeaders(
  headers: Record<string, string>,
  engine: Engine,
  ctx: Ctx,
): Promise<Record<string, string>> {
  const rendered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const resolved = await engine.render(value, ctx);
    rendered[key.toLowerCase()] = resolved === undefined || resolved === null ? '' : String(resolved);
  }
  return rendered;
}

function toResponse(method: string, res: MockResponse, headers: Record<string, string>): Response {
  if (!headers['content-type'] && typeof res.body !== 'string' && shouldSendBody(method, res.status)) {
    headers['content-type'] = 'application/json';
  }

  if (!shouldSendBody(method, res.status)) {
    return new Response(null, {
      status: res.status,
      headers,
    });
  }

  const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  return new Response(body, {
    status: res.status,
    headers,
  });
}

function shouldSendBody(method: string, status: number): boolean {
  if (method.toUpperCase() === 'HEAD') {
    return false;
  }
  return status !== 204 && status !== 304;
}

function methodNotAllowed(match: MatchResult, method: string): Response {
  return jsonResponse(
    {
      error: 'MethodNotAllowed',
      endpoint: match.route.pathTemplate,
      method,
      message: `No ${method} response is defined for ${match.route.pathTemplate}`,
    },
    405,
    {
      allow: Array.from(match.route.methods).sort().join(', '),
    },
  );
}

function errorResponse(error: unknown, match: MatchResult, method: string): Response {
  if (error instanceof TemplateError) {
    return jsonResponse(
      {
        error: error.name,
        message: error.message,
      },
      500,
    );
  }

  if (error instanceof HookError) {
    return jsonResponse(
      {
        error: error.name,
        endpoint: match.route.pathTemplate,
        method,
        message: error.message,
      },
      500,
    );
  }

  return jsonResponse(
    {
      error: 'InternalServerError',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
    500,
  );
}

function parseQuery(searchParams: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    query[key] = values.length > 1 ? values : (values[0] ?? '');
  }
  return query;
}

function headersToObject(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

async function tryReadBody(req: Request): Promise<unknown> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }

  const raw = await req.text();
  if (!raw) {
    return undefined;
  }

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {}),
    },
  });
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}
