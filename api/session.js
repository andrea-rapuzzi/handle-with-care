// GET: sono dentro?  POST { password }: login.  DELETE: logout.
const { send, body, ip, wrap } = require('../lib/http');
const auth = require('../lib/auth');
const { store } = require('../lib/store');

const MAX_ERRORI = 10, FINESTRA = 15 * 60; // 10 tentativi sbagliati ogni 15 minuti per indirizzo

module.exports = wrap(async (req, res) => {
  if (req.method === 'GET') return send(res, 200, { ok: auth.isAuthed(req), configurato: auth.configured() });
  if (req.method === 'DELETE') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(req, '') });
  if (req.method !== 'POST') return send(res, 405, { error: 'Metodo non permesso' });
  if (!auth.configured()) return send(res, 503, { error: 'Password non configurata: imposta DIARIO_PASSWORD.' });

  const b = await body(req);
  const k = 'diario:errori:' + ip(req);
  const blocco = { error: 'Troppi tentativi. Riprova tra un quarto d\'ora.' };
  if (await store().count(k) >= MAX_ERRORI) return send(res, 429, blocco);
  if (!auth.checkPassword(b && b.password)) {
    const n = await store().hit(k, FINESTRA);
    await new Promise(r => setTimeout(r, 400));
    return n >= MAX_ERRORI ? send(res, 429, blocco) : send(res, 401, { error: 'Password sbagliata' });
  }
  send(res, 200, { ok: true }, { 'Set-Cookie': auth.cookieHeader(req, auth.makeToken()) });
});
