import type { Hook } from 'smocky';

const hook: Hook = (req, res, ctx) => {
  const users = ctx.db?.collection<{ id: string; name: string; active?: boolean }>('users');
  const userId = req.params.id ?? '';

  if (req.method === 'GET') {
    const user = users?.find(userId);
    if (!user || userId === '404') {
      res.status = 404;
      res.body = { error: 'not found', id: userId };
    } else {
      res.body = user;
    }
  }

  if (req.method === 'DELETE') {
    const removed = users?.remove(userId) ?? false;
    if (!removed) {
      res.status = 404;
      res.body = { error: 'not found', id: userId };
    }
  }

  res.headers['x-hooked'] = 'true';
};

export default hook;
