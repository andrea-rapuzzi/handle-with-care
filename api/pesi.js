// Pesate. GET: tutte.  POST: nuova.  PUT ?id=: modifica.  DELETE ?id=: elimina.
const crypto = require('crypto');
const { send, body, query, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { pesi } = require('../lib/store');
const P = require('../lib/pesi');

module.exports = wrap(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const q = query(req), s = pesi();

  if (req.method === 'GET') return send(res, 200, P.sortP(await s.list()));
  if (req.method === 'POST' || req.method === 'PUT') {
    const c = P.clean(await body(req));
    if (c.error) return send(res, 400, { error: c.error });
    const now = new Date().toISOString();
    if (req.method === 'POST') {
      c.p.id = crypto.randomUUID(); c.p.creato = now;
    } else {
      const old = (await s.list()).find(p => p.id === q.id);
      if (!old) return send(res, 404, { error: 'Pesata non trovata (forse è stata eliminata)' });
      c.p.id = old.id; c.p.creato = old.creato; c.p.modificato = now;
    }
    await (req.method === 'POST' ? s.add(c.p) : s.put(c.p));
    return send(res, req.method === 'POST' ? 201 : 200, c.p);
  }
  if (req.method === 'DELETE') {
    if (!q.id) return send(res, 400, { error: 'Manca l\'id' });
    return (await s.del(q.id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Pesata non trovata' });
  }
  send(res, 405, { error: 'Metodo non permesso' });
});
