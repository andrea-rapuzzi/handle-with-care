// Server locale per sviluppo e test: serve public/ e instrada /api/* alle stesse funzioni usate su Vercel.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const PUB = path.join(__dirname, 'public');
const HEADERS = require('./vercel.json').headers[0].headers;

function start(port) {
  const srv = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const m = p.match(/^\/api\/([a-z]+)$/);
    if (m && fs.existsSync(path.join(__dirname, 'api', m[1] + '.js'))) return require('./api/' + m[1] + '.js')(req, res);
    const file = path.join(PUB, path.normalize(p === '/' ? '/index.html' : p));
    if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Non trovato'); }
    HEADERS.forEach(h => res.setHeader(h.key, h.value));
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => srv.listen(port, () => ok(srv)));
}

if (require.main === module) {
  if (!process.env.DIARIO_PASSWORD) { process.env.DIARIO_PASSWORD = 'Enrico'; console.log('DIARIO_PASSWORD non impostata: uso "Enrico" (solo in locale).'); }
  const port = Number(process.env.PORT) || 8000;
  start(port).then(() => console.log('Diario su http://localhost:' + port));
}
module.exports = { start };
