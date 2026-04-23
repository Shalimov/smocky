export default function hook(req, res, ctx) {
  if (req.method === 'POST') {
    res.body = ctx.db.collection('users').insert(req.body);
    res.status = 201;
  }
}
