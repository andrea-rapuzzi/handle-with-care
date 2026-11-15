// Accesso con una sola password condivisa (variabile DIARIO_PASSWORD).
// Dopo il login il browser riceve un cookie firmato, valido un anno: niente password a ogni visita.
const crypto = require('crypto');
const { cookies, send } = require('./http');

const COOKIE = 'diario_s';
const MAX_AGE = 365 * 24 * 3600;

const password = () => String(process.env.DIARIO_PASSWORD || '').trim();
// La chiave di firma deriva dalla password: cambiarla fa uscire tutti i dispositivi.
const key = () => crypto.createHash('sha256').update('diario-sessione|' + (process.env.SESSION_SECRET || '') + '|' + password()).digest();
const sign = exp => crypto.createHmac('sha256', key()).update(String(exp)).digest('base64url');
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const makeToken = () => { const exp = Math.floor(Date.now() / 1000) + MAX_AGE; return exp + '.' + sign(exp); };
function validToken(tok) {
  const [exp, sig] = String(tok || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return same(sig, sign(exp));
}

const configured = () => password().length > 0;
const checkPassword = p => configured() && same(String(p == null ? '' : p).trim(), password());
const isAuthed = req => configured() && validToken(cookies(req)[COOKIE]);

function cookieHeader(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || !!process.env.DIARIO_ONLINE;
  return `${COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? MAX_AGE : 0}${secure ? '; Secure' : ''}`;
}

// true se la richiesta può proseguire, altrimenti ha già risposto.
function requireAuth(req, res) {
  if (!configured()) { send(res, 503, { error: 'Password non configurata: imposta DIARIO_PASSWORD.' }); return false; }
  if (!isAuthed(req)) { send(res, 401, { error: 'Accesso richiesto' }); return false; }
  return true;
}

module.exports = { configured, checkPassword, isAuthed, requireAuth, makeToken, cookieHeader };
