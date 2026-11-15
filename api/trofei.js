// Trofei sbloccati, salvati nella scheda Trofei. GET: tutti, { id, data }.
// POST { trofei: [{ id, data }] }: registra quelli che non ci sono ancora. Nome e descrizione li prende da Calcs.TROFEI.
const { send, body, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { trofei } = require('../lib/store');
const Calcs = require('../public/calcs.js');

const DEF = new Map(Calcs.TROFEI.map(t => [t.id, t]));
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const short = l => l.map(t => ({ id: t.id, data: t.data || '' }));

module.exports = wrap(async (req, res) => {
  if (!requireAuth(req, res)) return;
  const s = trofei();
  if (req.method === 'GET') return send(res, 200, short(await s.list()));
  if (req.method === 'POST') {
    const b = await body(req), list = b && Array.isArray(b.trofei) ? b.trofei : null;
    if (!list || list.length > Calcs.TROFEI.length) return send(res, 400, { error: 'Elenco di trofei non valido' });
    const have = new Set((await s.list()).map(t => t.id)), now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const nuovi = [];
    for (const t of list) {
      const d = DEF.get(String(t && t.id)), data = String(t && t.data || '');
      if (!d || !validDate(data)) return send(res, 400, { error: 'Trofeo non valido' });
      if (have.has(d.id)) continue;
      have.add(d.id); nuovi.push({ id: d.id, nome: d.nome, desc: d.desc, data, registrato: now });
    }
    await s.addMany(nuovi);
    return send(res, 200, { aggiunti: nuovi.length, trofei: short(await s.list()) });
  }
  send(res, 405, { error: 'Metodo non permesso' });
});
