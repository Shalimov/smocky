import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import type { ResponseDefinition } from './types';

export interface Route {
  pattern: string[];
  pathTemplate: string;
  paramNames: string[];
  methods: Set<string>;
  responseFile: string;
  hookFile: string | null;
  specificity: number;
}

export interface MatchResult {
  route: Route;
  params: Record<string, string>;
}

export interface Router {
  match(method: string, path: string): MatchResult | null;
  routes(): Route[];
}

export async function buildRouter(endpointsDir: string): Promise<Router> {
  const absoluteEndpointsDir = resolve(endpointsDir);
  const routes: Route[] = [];

  try {
    await walk(absoluteEndpointsDir, absoluteEndpointsDir, routes);
  } catch {
    return createRouter([]);
  }

  return createRouter(routes);
}

async function walk(root: string, currentDir: string, routes: Route[]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  if (fileNames.has('response.json')) {
    routes.push(await createRoute(root, currentDir, fileNames));
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    await walk(root, join(currentDir, entry.name), routes);
  }
}

async function createRoute(root: string, folder: string, fileNames: Set<string>): Promise<Route> {
  const relativePath = relative(root, folder);
  const pattern = relativePath ? relativePath.split(sep) : [];
  const methods = await loadMethods(join(folder, 'response.json'));
  const hookFile = fileNames.has('hook.ts')
    ? join(folder, 'hook.ts')
    : fileNames.has('hook.js')
      ? join(folder, 'hook.js')
      : null;

  return {
    pattern,
    pathTemplate: pattern.length === 0 ? '/' : `/${pattern.join('/')}`,
    paramNames: pattern.filter((segment) => segment.startsWith('_')).map((segment) => segment.slice(1)),
    methods,
    responseFile: join(folder, 'response.json'),
    hookFile,
    specificity: computeSpecificity(pattern),
  };
}

async function loadMethods(responseFile: string): Promise<Set<string>> {
  const definition = (await Bun.file(responseFile).json()) as ResponseDefinition;
  return new Set(Object.keys(definition).map((method) => method.toUpperCase()));
}

function createRouter(routes: Route[]): Router {
  const sortedRoutes = [...routes].sort((left, right) => right.specificity - left.specificity);
  const buckets = new Map<number, Route[]>();

  for (const route of sortedRoutes) {
    const bucket = buckets.get(route.pattern.length) ?? [];
    bucket.push(route);
    buckets.set(route.pattern.length, bucket);
  }

  return {
    match(_method: string, path: string): MatchResult | null {
      const requestSegments = normalizePath(path);
      const candidates = buckets.get(requestSegments.length) ?? [];

      for (const route of candidates) {
        const params: Record<string, string> = {};
        let matched = true;

        for (const [index, segment] of route.pattern.entries()) {
          const actual = requestSegments[index];
          if (segment.startsWith('_')) {
            if (actual === undefined) {
              matched = false;
              break;
            }
            params[segment.slice(1)] = actual;
            continue;
          }

          if (segment !== actual) {
            matched = false;
            break;
          }
        }

        if (matched) {
          return { route, params };
        }
      }

      return null;
    },
    routes(): Route[] {
      return [...sortedRoutes];
    },
  };
}

function normalizePath(path: string): string[] {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? trimmed.split('/') : [];
}

function computeSpecificity(segments: string[]): number {
  let specificity = 0;
  for (const segment of segments) {
    specificity = (specificity << 1) | (segment.startsWith('_') ? 0 : 1);
  }
  return specificity;
}
