export default function hook(req, res, ctx) {
  const users = ctx.db.collection('users');
  if (req.method === 'DELETE') {
    const removed = users.remove(req.params.id);
    if (!removed) {
      res.status = 404;
      res.body = { error: 'not found' };
    }
  }
}
