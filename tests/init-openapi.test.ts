import { describe, expect, test } from 'bun:test';

import {
  planEndpoints,
  specPathToFolder,
  listOpsByTag,
} from '../src/cli/init/openapi-to-endpoint';
import type { OpenApiSpec } from '../src/checker/types';
import { listOperations } from '../src/checker/utils';

describe('specPathToFolder', () => {
  test('static segments pass through', () => {
    expect(specPathToFolder('/users')).toBe('users');
    expect(specPathToFolder('/api/v1/health')).toBe('api/v1/health');
  });

  test('path params become _name', () => {
    expect(specPathToFolder('/users/{id}')).toBe('users/_id');
    expect(specPathToFolder('/orgs/{orgId}/repos/{repo}')).toBe('orgs/_orgId/repos/_repo');
  });

  test('rejects unsupported segment chars', () => {
    expect(specPathToFolder('/foo/bar baz')).toBeNull();
    expect(specPathToFolder('/foo/{a-b}')).toBeNull();
  });
});

const fixtureSpec: OpenApiSpec = {
  openapi: '3.0.0',
  info: { title: 'fixture', version: '1.0.0' },
  paths: {
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        tags: ['users'],
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name'],
                  properties: { id: { type: 'string' }, name: { type: 'string' } },
                  additionalProperties: false,
                },
                example: { id: 'u_1', name: 'Ada' },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'deleteUser',
        tags: ['users'],
        responses: { '204': { description: 'gone' } },
      },
    },
    '/health': {
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: {
              'text/plain': { example: 'OK' },
            },
          },
        },
      },
    },
  },
};

describe('planEndpoints', () => {
  test('groups methods per folder and prefers examples', () => {
    const ops = listOperations(fixtureSpec);
    const result = planEndpoints({
      spec: fixtureSpec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });

    expect(result.warnings).toEqual([]);
    expect(result.plans).toHaveLength(2);

    const usersPlan = result.plans.find((p) => p.folderPath === 'users/_id');
    expect(usersPlan).toBeDefined();
    expect(Object.keys(usersPlan!.methodBlocks).sort()).toEqual(['DELETE', 'GET']);
    expect(usersPlan!.methodBlocks.GET).toEqual({
      status: 200,
      body: { id: 'u_1', name: 'Ada' },
    });
    // 204 with no content -> empty {} body
    expect(usersPlan!.methodBlocks.DELETE!.status).toBe(204);

    const healthPlan = result.plans.find((p) => p.folderPath === 'health');
    expect(healthPlan).toBeDefined();
    expect(healthPlan!.methodBlocks.GET).toEqual({
      status: 200,
      body: 'OK',
      headers: { 'content-type': 'text/plain' },
    });
  });

  test('faker-only path falls back to {} when schema generation impossible', () => {
    const minimal: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: { 'application/json': {} },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(minimal);
    const result = planEndpoints({
      spec: minimal,
      selected: ops,
      strategy: { useExamples: true, useFaker: true, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET).toEqual({ status: 200, body: {} });
  });
});

describe('listOpsByTag', () => {
  test('puts untagged ops in (untagged) bucket and sorts', () => {
    const groups = listOpsByTag(fixtureSpec);
    const tags = groups.map((g) => g.tag);
    expect(tags).toContain('users');
    expect(tags).toContain('(untagged)');
    const usersGroup = groups.find((g) => g.tag === 'users')!;
    expect(usersGroup.ops).toHaveLength(2);
  });
});
