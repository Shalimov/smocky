import type { Hook } from 'smocky';

const hook: Hook = (req, res, ctx) => {
  const users = ctx.db?.collection<{ id: string; name: string; active?: boolean }>('users');

  if (req.method === 'POST' && users && req.body && typeof req.body === 'object') {
    res.body = users.insert(req.body as { name: string; active?: boolean });
    res.status = 201;
  }
};

export default hook;
