// GET: tutti gli eventi (?format=csv per scaricarli).  POST: nuovo.  PUT ?id=: modifica.  DELETE ?id=: elimina.
const crypto = require('crypto');
const { send, body, query, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { store } = require('../lib/store');
const E = require('../lib/events');

module.exports = wrap(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const q = query(req), s = store();

  if (req.method === 'GET') {
    const evs = E.sortEv(await s.list());
    if (q.format === 'csv') return send(res, 200, E.toCSV(evs), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="diario.csv"' });
    return send(res, 200, evs);
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const c = E.clean(await body(req));
    if (c.error) return send(res, 400, { error: c.error });
    const now = new Date().toISOString();
    if (req.method === 'POST') {
      c.ev.id = crypto.randomUUID(); c.ev.creato = now;
    } else {
      const old = (await s.list()).find(e => e.id === q.id);
      if (!old) return send(res, 404, { error: 'Evento non trovato (forse è stato eliminato)' });
      c.ev.id = old.id; c.ev.creato = old.creato; c.ev.modificato = now;
    }
    await (req.method === 'POST' ? s.add(c.ev) : s.put(c.ev));
    return send(res, req.method === 'POST' ? 201 : 200, c.ev);
  }
  if (req.method === 'DELETE') {
    if (!q.id) return send(res, 400, { error: 'Manca l\'id' });
    return (await s.del(q.id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Evento non trovato' });
  }
  send(res, 405, { error: 'Metodo non permesso' });
});
