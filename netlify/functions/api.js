// Adattatore Netlify: traduce l'evento della funzione nella coppia (req, res) usata dagli handler di api/.
// netlify.toml manda qui tutte le richieste a /api/*.
process.env.DIARIO_ONLINE = '1'; // in produzione: niente archivio su file, cookie sempre Secure

const HEADERS = require('../../lib/headers');
const HANDLERS = {
  events: require('../../api/events'),
  import: require('../../api/import'),
  session: require('../../api/session')
};

exports.handler = async event => {
  const name = String(event.path || '').split('/').filter(Boolean).pop();
  const out = { statusCode: 404, headers: Object.assign({ 'Cache-Control': 'no-store' }, HEADERS), body: 'Non trovato' };
  if (!Object.prototype.hasOwnProperty.call(HANDLERS, name)) return out;

  const headers = {};
  Object.entries(event.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
  // Indirizzo del visitatore come lo vede Netlify, non quello dichiarato dal client.
  if (headers['x-nf-client-connection-ip']) headers['x-forwarded-for'] = headers['x-nf-client-connection-ip'];

  const qs = event.rawQuery != null ? event.rawQuery : new URLSearchParams(event.queryStringParameters || {}).toString();
  const req = {
    method: event.httpMethod,
    url: '/api/' + name + (qs ? '?' + qs : ''),
    headers,
    body: event.body == null ? '' : (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body),
    socket: {}
  };

  await new Promise(done => {
    const res = {
      statusCode: 200,
      setHeader(k, v) { out.headers[k] = v; },
      end(b) { out.statusCode = res.statusCode; out.body = b == null ? '' : String(b); done(); }
    };
    HANDLERS[name](req, res);
  });
  return out;
};
