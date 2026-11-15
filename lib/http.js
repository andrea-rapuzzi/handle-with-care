// Piccoli aiuti HTTP: funzionano sia su Netlify (tramite netlify/functions/diario.js) sia con il server locale (dev-server.js).
function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  if (body == null) return res.end();
  if (typeof body === 'string') return res.end(body);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const query = req => Object.fromEntries(new URL(req.url, 'http://x').searchParams);

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Corpo JSON della richiesta. Su Netlify è già in req.body, in locale va letto dallo stream.
async function body(req) {
  let raw;
  if ('body' in req) {
    try { raw = req.body; } catch (e) { return null; }
    if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
    raw = raw == null ? '' : String(raw);
  } else {
    raw = await new Promise((ok, ko) => {
      let s = '', n = 0;
      req.on('data', c => { n += c.length; if (n > 2e6) { ko(new Error('troppo grande')); req.destroy(); } else s += c; });
      req.on('end', () => ok(s)); req.on('error', ko);
    }).catch(() => null);
    if (raw == null) return null;
  }
  try { return JSON.parse(raw); } catch (e) { return null; }
}

const ip = req => String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'x').split(',')[0].trim();

// Esegue un handler trasformando gli errori in risposte leggibili.
function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e && e.code === 'NO_STORE') return send(res, 503, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Errore del server' });
    }
  };
}

module.exports = { send, query, cookies, body, ip, wrap };
