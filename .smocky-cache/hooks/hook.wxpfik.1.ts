export default function hook(_req, res) {
  res.headers['x-hooked'] = 'true';
}
