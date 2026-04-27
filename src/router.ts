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

export interface SourceHandle {
  id: string;
  priority: number;
}

interface Source {
  id: string;
  priority: number;
  routes: Route[];
}

interface BucketedSource extends Source {
  buckets: Map<number, Route[]>;
}

export interface Router {
  match(method: string, path: string): MatchResult | null;
  routes(): Route[];
  addSource(routes: Route[], priority: number): SourceHandle;
  removeSource(sourceId: string): void;
}

export function createEmptyRouter(): Router {
  return createRouter([]);
}

export async function buildRouter(endpointsDir: string): Promise<Router> {
  const absoluteEndpointsDir = resolve(endpointsDir);
  const routes: Route[] = [];

  try {
    await walk(absoluteEndpointsDir, absoluteEndpointsDir, routes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return createRouter([]);
  }

  return createRouter(routes);
}

export async function scanRoutes(dir: string): Promise<Route[]> {
  const routes: Route[] = [];
  const absoluteDir = resolve(dir);

  try {
    await walk(absoluteDir, absoluteDir, routes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return routes;
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

function createRouter(initialRoutes: Route[]): Router {
  let nextSourceId = 1;
  const sources: BucketedSource[] = [];

  function bucketRoutes(routes: Route[]): Map<number, Route[]> {
    const sorted = [...routes].sort((left, right) => right.specificity - left.specificity);
    const buckets = new Map<number, Route[]>();

    for (const route of sorted) {
      const bucket = buckets.get(route.pattern.length) ?? [];
      bucket.push(route);
      buckets.set(route.pattern.length, bucket);
    }

    return buckets;
  }

  function findMatch(method: string, path: string): MatchResult | null {
    const requestSegments = normalizePath(path);
    const upperMethod = method.toUpperCase();
    const candidates = sources
      .filter((source) => source.buckets.has(requestSegments.length))
      .flatMap((source) => {
        const bucket = source.buckets.get(requestSegments.length) ?? [];
        return bucket.map((route) => ({ route, sourcePriority: source.priority }));
      });

      const sortedCandidates = candidates.sort((left, right) => {
        const prioDiff = right.sourcePriority - left.sourcePriority;
        if (prioDiff !== 0) {
          return prioDiff;
        }
        return right.route.specificity - left.route.specificity;
      });

    for (const { route } of sortedCandidates) {
      if (!route.methods.has(upperMethod)) {
        continue;
      }

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
  }

  if (initialRoutes.length > 0) {
    sources.push({
      id: `source-${nextSourceId++}`,
      priority: 0,
      routes: initialRoutes,
      buckets: bucketRoutes(initialRoutes),
    });
  }

  return {
    match(method: string, path: string): MatchResult | null {
      return findMatch(method, path);
    },
    routes(): Route[] {
      return sources.flatMap((source) => source.routes);
    },
    addSource(routes: Route[], priority: number): SourceHandle {
      const id = `source-${nextSourceId++}`;
      sources.push({
        id,
        priority,
        routes,
        buckets: bucketRoutes(routes),
      });
      return { id, priority };
    },
    removeSource(sourceId: string): void {
      const index = sources.findIndex((source) => source.id === sourceId);
      if (index !== -1) {
        sources.splice(index, 1);
      }
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
