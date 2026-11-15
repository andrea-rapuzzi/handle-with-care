// POST { csv, modo }: importa un CSV con le colonne del vecchio foglio.
// modo "aggiungi" (default) salta le righe già presenti (stesso contenuto); "sostituisci" cancella tutto e ricarica dal file.
const { send, body, wrap } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { store } = require('../lib/store');
const E = require('../lib/events');

module.exports = wrap(async (req, res) => {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Metodo non permesso' });
  const b = await body(req);
  const evs = E.fromCSV(b && b.csv ? String(b.csv) : '');
  if (!evs.length) return send(res, 400, { error: 'Nessun evento riconosciuto nel file. Servono le colonne: Data, Ora, Evento, Pipi, Cacca, Latte, ml, Note.' });
  const s = store();
  let nuovi = evs;
  if (b.modo === 'sostituisci') await s.clear();
  else {
    const have = new Map();
    (await s.list()).forEach(e => { const k = E.key(e); have.set(k, (have.get(k) || 0) + 1); });
    nuovi = evs.filter(e => { const k = E.key(e), n = have.get(k) || 0; if (n > 0) { have.set(k, n - 1); return false; } return true; });
  }
  await s.putMany(nuovi);
  send(res, 200, { importati: evs.length, nuovi: nuovi.length, totale: (await s.list()).length });
});
