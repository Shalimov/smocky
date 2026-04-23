import type { Hook } from 'smocky';

const hook: Hook = (req, res) => {
  if (!res.body) {
    res.status = 404;
    res.body = { error: 'not found', id: req.params.id };
  }
};

export default hook;
