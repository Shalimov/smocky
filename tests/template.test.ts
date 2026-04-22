import { describe, expect, test } from 'bun:test';

import { createEngine, TemplateError } from '../src/template';
import type { Ctx, Helper, MockRequest } from '../src/types';

const helpers = new Map<string, Helper>([
  ['buildUser', async () => ({ id: 7, role: 'admin' })],
  ['sum', (left: string, right: string) => Number(left) + Number(right)],
  ['echo', (...args: string[]) => args.join('|')],
  ['explode', () => {
    throw new Error('boom');
  }],
]);

const engine = createEngine(helpers);

const request: MockRequest = {
  method: 'POST',
  path: '/users/42',
  params: { id: '42' },
  query: { q: 'search', tags: ['a', 'b'] },
  headers: { authorization: 'Bearer token' },
  body: { profile: { name: 'Ada' } },
  raw: new Request('http://localhost/users/42?q=search', { method: 'POST' }),
};

const ctx: Ctx = { req: request };

describe('template engine', () => {
  test('returns the helper result type for single-token strings', async () => {
    await expect(engine.render('{{ buildUser }}', ctx)).resolves.toEqual({ id: 7, role: 'admin' });
    await expect(engine.render('{{ sum 1 2 }}', ctx)).resolves.toBe(3);
  });

  test('stringifies embedded tokens and supports quoted args', async () => {
    await expect(engine.render('id-{{ echo "a b" c }}', ctx)).resolves.toBe('id-a b|c');
  });

  test('resolves req.* paths, arrays, objects, and missing values', async () => {
    await expect(
      engine.render(
        {
          id: '{{ req.params.id }}',
          query: '{{ req.query.q }}',
          auth: '{{ req.headers.authorization }}',
          name: '{{ req.body.profile.name }}',
          lucky: '{{ sum 4 5 }}',
          nested: ['{{ sum 1 2 }}', 'user-{{ req.params.id }}'],
          missingValue: '{{ req.query.missing }}',
          missingInString: 'x{{ req.query.missing }}y',
        },
        ctx,
      ),
    ).resolves.toEqual({
      id: '42',
      query: 'search',
      auth: 'Bearer token',
      name: 'Ada',
      lucky: 9,
      nested: [3, 'user-42'],
      missingValue: null,
      missingInString: 'xy',
    });
  });

  test('supports escaping literal opening braces', async () => {
    await expect(engine.render('prefix {\{ literal', ctx)).resolves.toBe('prefix {{ literal');
  });

  test('throws TemplateError for reserved db namespace, unknown helpers, and helper failures', async () => {
    await expect(engine.render('{{ db.users.all }}', ctx)).rejects.toBeInstanceOf(TemplateError);
    await expect(engine.render('{{ missingHelper }}', ctx)).rejects.toBeInstanceOf(TemplateError);
    await expect(engine.render('{{ explode }}', ctx)).rejects.toThrow('helper "explode" failed');
  });
});
