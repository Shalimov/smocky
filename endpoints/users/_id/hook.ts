import type { Hook } from 'smocker';

const hook: Hook = (req, res) => {
  if (req.params.id === '404') {
    res.status = 404;
    res.body = { error: 'not found', id: req.params.id };
  }

  res.headers['x-hooked'] = 'true';
};

export default hook;
