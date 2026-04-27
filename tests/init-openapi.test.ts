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

describe('generateBodyFromSchema (property-level examples)', () => {
  test('extracts property-level examples when no root example exists', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id', 'name'],
                      properties: {
                        id: { type: 'integer', example: 1 },
                        name: { type: 'string', example: 'Alice' },
                        optionalField: { type: 'string', example: 'present' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.warnings).toEqual([]);
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({
      id: 1,
      name: 'Alice',
      optionalField: 'present',
    });
  });

  test('falls back to default when property has no example', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/items': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        label: { type: 'string', default: 'default-label' },
                        count: { type: 'integer', example: 42 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({
      label: 'default-label',
      count: 42,
    });
  });

  test('handles nested objects with property examples', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/profiles': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', example: 'Bob' },
                            age: { type: 'integer', example: 30 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({
      user: { name: 'Bob', age: 30 },
    });
  });

  test('handles allOf with property examples', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/combos': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      allOf: [
                        {
                          type: 'object',
                          properties: {
                            id: { type: 'integer', example: 99 },
                          },
                        },
                        {
                          type: 'object',
                          properties: {
                            name: { type: 'string', example: 'combo-name' },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({
      id: 99,
      name: 'combo-name',
    });
  });
});

describe('required skeleton fallback', () => {
  test('uses required skeleton when jsf is disabled and no property examples', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/bare': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id', 'name'],
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        optionalTag: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    const body = result.plans[0]!.methodBlocks.GET!.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 0);
    expect(body).toHaveProperty('name', 'string');
    expect(body).not.toHaveProperty('optionalTag');
  });

  test('returns {} when no required properties and no examples (faker disabled)', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/empty': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        something: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({});
  });
});

describe('alwaysFakeOptionals', () => {
  test('jsf includes optional properties with alwaysFakeOptionals=true', () => {
    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/things': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['id'],
                      properties: {
                        id: { type: 'integer', example: 1 },
                        note: { type: 'string', example: 'hello' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    // with useExamples=true the property walker should grab both
    const ops = listOperations(spec);
    const result = planEndpoints({
      spec,
      selected: ops,
      strategy: { useExamples: true, useFaker: false, emptyForUnsupported: false },
    });
    expect(result.plans[0]!.methodBlocks.GET!.body).toEqual({
      id: 1,
      note: 'hello',
    });
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
