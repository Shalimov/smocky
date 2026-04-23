export default function hook(req, res, ctx) {
  const users = ctx.db.collection('users');
  if (req.method === 'POST') {
    res.body = users.insert(req.body);
    res.status = 201;
    return;
  }
  if (req.method === 'GET') {
    res.headers['x-count'] = String(users.all().length);
  }
}
