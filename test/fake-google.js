// Finto Google per i test: endpoint del token e la parte dell'API Sheets che usiamo.
// Imita i comportamenti che contano: date e ore salvate come numeri seriali, celle vuote in coda tagliate,
// apostrofo iniziale = testo, limite di righe della griglia, colonne J:L con "formule" che non vanno toccate.
const http = require('http');
const crypto = require('crypto');

const COLS = 12; // A..L
const colN = s => s.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parseA1(a1) {
  const m = a1.match(/^'?(.*?)'?!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
  return { tab: m[1], c0: colN(m[2]), r0: m[3] ? Number(m[3]) : 1, c1: m[4] ? colN(m[4]) : colN(m[2]), r1: m[5] ? Number(m[5]) : (m[4] ? Infinity : (m[3] ? Number(m[3]) : Infinity)) };
}
function entered(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  // "19:30" scritto come testo NON diventa un orario: nel foglio vero (in italiano) resta testo.
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  if (v.startsWith('=')) throw new Error('una formula è finita nel foglio: ' + v);
  return v;
}

function fakeGoogle({ publicKey, email, tab = 'Log', gid = 664740751, rowCount = 1000, seed = [] }) {
  const state = { grid: [], rowCount, calls: [], writable: true };
  const blank = () => { const r = new Array(COLS).fill(''); r[9] = 'f'; r[10] = 'f'; r[11] = 'f'; return r; };
  const row = n => { while (state.grid.length < n) state.grid.push(blank()); return state.grid[n - 1]; };
  seed.forEach((r, i) => r.forEach((v, c) => { row(i + 1)[c] = v; }));
  const lastData = (c0, c1) => { for (let i = state.grid.length; i > 0; i--) if (state.grid[i - 1].slice(c0, c1 + 1).some(v => v !== '')) return i; return 0; };
  const put = (r0, c0, values, mode) => {
    if (!state.writable) { const e = new Error('The caller does not have permission'); e.status = 403; throw e; }
    if (r0 + values.length - 1 > state.rowCount) { const e = new Error('Range exceeds grid limits'); e.status = 400; throw e; }
    values.forEach((vals, i) => vals.forEach((v, j) => { if (c0 + j > 8) throw new Error('scrittura oltre la colonna I'); row(r0 + i)[c0 + j] = mode === 'RAW' ? v : entered(v); }));
  };

  const srv = http.createServer((req, res) => {
    let s = ''; req.on('data', c => { s += c; }); req.on('end', () => {
      const send = (code, o) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      try {
        const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), q = u.searchParams;
        if (p === '/token') {
          const jwt = new URLSearchParams(s).get('assertion'), [h, c, sig] = jwt.split('.');
          const claims = JSON.parse(Buffer.from(c, 'base64url'));
          const good = crypto.createVerify('RSA-SHA256').update(h + '.' + c).verify(publicKey, sig, 'base64url') && claims.iss === email && /spreadsheets/.test(claims.scope) && claims.exp > Date.now() / 1000;
          return good ? send(200, { access_token: 'tok-ok', expires_in: 3600 }) : send(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
        }
        if (req.headers.authorization !== 'Bearer tok-ok') return send(401, { error: { message: 'no token' } });
        const m = p.match(/^\/v4\/spreadsheets\/([^/:]+)(.*)$/);
        if (!m || m[1] !== 'FOGLIO') return send(404, { error: { message: 'Requested entity was not found.' } });
        const rest = m[2], body = s ? JSON.parse(s) : {};
        state.calls.push(req.method + ' ' + rest.replace(/'.*?'!/, ''));
        if (rest === '') return send(200, { sheets: [{ properties: { sheetId: 1, title: 'Come usarlo', gridProperties: { rowCount: 1000 } } }, { properties: { sheetId: gid, title: tab, gridProperties: { rowCount: state.rowCount } } }] });
        if (rest === ':batchUpdate') {
          body.requests.forEach(r => {
            if (r.deleteDimension) { const g = r.deleteDimension.range; if (g.sheetId !== gid || g.endIndex - g.startIndex !== 1) throw new Error('delete inatteso'); state.grid.splice(g.startIndex, 1); state.rowCount--; }
            else if (r.appendDimension) { if (r.appendDimension.sheetId !== gid) throw new Error('append inatteso'); state.rowCount += r.appendDimension.length; }
            else throw new Error('richiesta non prevista');
          });
          return send(200, {});
        }
        if (rest === '/values:batchUpdate') { body.data.forEach(d => { const a = parseA1(d.range); put(a.r0, a.c0, d.values, body.valueInputOption); }); return send(200, {}); }
        const v = rest.match(/^\/values\/(.+?)(:append|:clear)?$/);
        const a = parseA1(v[1]);
        if (a.tab !== tab) return send(400, { error: { message: 'Unable to parse range: ' + v[1] } });
        if (v[2] === ':clear') { for (let i = a.r0; i <= state.grid.length; i++) for (let c = a.c0; c <= a.c1; c++) row(i)[c] = ''; return send(200, {}); }
        if (v[2] === ':append') {
          if (q.get('insertDataOption') !== 'OVERWRITE') throw new Error('append senza OVERWRITE sposterebbe le formule');
          const r0 = lastData(a.c0, a.c1) + 1; if (r0 + body.values.length - 1 > state.rowCount) state.rowCount = r0 + body.values.length - 1;
          put(r0, a.c0, body.values, q.get('valueInputOption'));
          return send(200, { updates: { updatedRange: `${tab}!A${r0}` } });
        }
        if (req.method === 'PUT') { put(a.r0, a.c0, body.values, q.get('valueInputOption')); return send(200, {}); }
        if (q.get('valueRenderOption') !== 'UNFORMATTED_VALUE' || q.get('dateTimeRenderOption') !== 'SERIAL_NUMBER') throw new Error('lettura senza valori grezzi');
        const n = lastData(a.c0, a.c1), values = [];
        for (let i = a.r0; i <= n; i++) { const r = row(i).slice(a.c0, a.c1 + 1); while (r.length && r[r.length - 1] === '') r.pop(); values.push(r); }
        return send(200, values.length ? { values } : {});
      } catch (e) { send(e.status || 500, { error: { message: e.message } }); }
    });
  });
  return new Promise(ok => srv.listen(0, () => ok({ srv, state, url: 'http://localhost:' + srv.address().port })));
}
module.exports = { fakeGoogle };
