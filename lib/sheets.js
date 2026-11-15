// Archivio su Google Sheet: la scheda "Log" del foglio è il database.
// Colonne A:H come nel foglio originale (Data, Ora, Evento, Pipì, Cacca, Latte, ml, Note), colonna I = ID della riga.
// Le colonne da J in poi (formule del foglio) non vengono mai scritte.
// Accesso con un service account Google (JWT firmato qui, nessuna libreria).
const crypto = require('crypto');
const Calcs = require('../public/calcs.js');
const E = require('./events');

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const fail = (msg) => { const e = new Error(msg); e.code = 'NO_STORE'; return e; };

// Numero seriale di Sheets -> 'YYYY-MM-DD' / 'HH:MM' (le celle data e ora sono numeri, qualunque sia la lingua del foglio)
const serialToDate = n => new Date(Math.round((Math.floor(n) - 25569) * 86400000)).toISOString().slice(0, 10);
const serialToTime = n => { const m = Math.round((n - Math.floor(n)) * 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const txt = v => "'" + v; // l'apostrofo iniziale dice a Sheets "questo è testo": niente formule o date indovinate nelle note

function sheetsStore(opts) {
  const creds = opts.creds, id = opts.sheetId, tab = opts.tab || 'Log';
  const api = (opts.apiBase || 'https://sheets.googleapis.com') + '/v4/spreadsheets/' + id;
  const tokenUrl = opts.tokenUrl || 'https://oauth2.googleapis.com/token';
  const rng = a1 => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${a1}`);
  let tok = null, meta = null;
  const hits = new Map();

  async function token() {
    if (tok && tok.exp > Date.now() + 60000) return tok.value;
    const now = Math.floor(Date.now() / 1000);
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: creds.client_email, scope: SCOPE, aud: tokenUrl, iat: now, exp: now + 3600 });
    let sig;
    try { sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url'); }
    catch (e) { throw fail('La chiave del service account non è valida (GOOGLE_SERVICE_ACCOUNT_JSON).'); }
    const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw fail('Google ha rifiutato il service account: ' + (j.error_description || j.error || r.status));
    tok = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return tok.value;
  }

  async function g(method, path, body) {
    const r = await fetch(api + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + await token() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const m = (j.error && j.error.message) || String(r.status);
    if (r.status === 403) throw fail(`Il foglio non è condiviso come Editor con ${creds.client_email} (oppure l'API Google Sheets non è attiva nel progetto Google Cloud). Dettaglio: ${m}`);
    if (r.status === 404) throw fail('Foglio non trovato: controlla GOOGLE_SHEET_ID.');
    if (r.status === 400 && /parse range/i.test(m)) throw fail(`Nel foglio manca la scheda "${tab}".`);
    throw new Error('Google Sheets: ' + m);
  }

  const toRow = e => { const r = E.toRow(e); r[7] = r[7] ? txt(r[7]) : ''; r.push(txt(e.id)); return r; };
  const write = (a1, values, mode) => g('PUT', `/values/${rng(a1)}?valueInputOption=${mode || 'USER_ENTERED'}`, { values });

  // Legge tutta la scheda. Le righe scritte a mano nel foglio (senza ID, o con un ID copiato da un'altra riga) ne ricevono uno.
  async function read() {
    const j = await g('GET', `/values/${rng('A1:I')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
    const rows = j.values || [], out = [], fix = [], seen = new Set();
    if (!rows.length) { await write('A1:I1', [['Data', 'Ora', 'Evento', 'Pipì', 'Cacca', 'Latte', 'ml', 'Note', 'ID']], 'RAW'); return { out, last: 1 }; }
    if (!String(rows[0][8] == null ? '' : rows[0][8]).trim()) fix.push({ range: `'${tab}'!I1`, values: [['ID']] });
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i] || [];
      const norm = c.slice(0, 8).map(v => (v == null ? '' : v));
      if (typeof norm[0] === 'number') norm[0] = serialToDate(norm[0]);
      if (typeof norm[1] === 'number') norm[1] = serialToTime(norm[1]);
      const parsed = Calcs.loadLog([[], norm.map(String)]);
      const ev = parsed.length ? E.fromLogRow(parsed[0]) : null;
      if (!ev) continue; // riga vuota o non leggibile: resta nel foglio, il sito la ignora
      let rid = String(c[8] == null ? '' : c[8]).trim();
      if (!rid || seen.has(rid)) { rid = crypto.randomUUID(); fix.push({ range: `'${tab}'!I${i + 1}`, values: [[rid]] }); }
      seen.add(rid); ev.id = rid;
      out.push({ row: i + 1, ev });
    }
    if (fix.length) await g('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: fix });
    return { out, last: rows.length };
  }

  async function sheetMeta() {
    if (meta) return meta;
    const j = await g('GET', '?fields=' + encodeURIComponent('sheets.properties(sheetId,title,gridProperties.rowCount)'));
    const s = (j.sheets || []).map(x => x.properties).find(p => p.title === tab);
    if (!s) throw fail(`Nel foglio manca la scheda "${tab}".`);
    return (meta = { gid: s.sheetId, rows: (s.gridProperties && s.gridProperties.rowCount) || 0 });
  }

  return {
    async list() { return (await read()).out.map(x => x.ev); },
    // Nuova riga in fondo. "append" è atomico lato Google: due salvataggi nello stesso istante non si pestano i piedi.
    async add(ev) { await g('POST', `/values/${rng('A:I')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, { values: [toRow(ev)] }); },
    async put(ev) {
      const hit = (await read()).out.find(x => x.ev.id === ev.id);
      if (!hit) return this.add(ev);
      await write(`A${hit.row}:I${hit.row}`, [toRow(ev)]);
    },
    async putMany(evs) {
      if (!evs.length) return;
      const { last } = await read(), m = await sheetMeta();
      const need = last + evs.length - m.rows;
      if (need > 0) { await g('POST', ':batchUpdate', { requests: [{ appendDimension: { sheetId: m.gid, dimension: 'ROWS', length: need } }] }); meta = null; }
      await write(`A${last + 1}:I${last + evs.length}`, evs.map(toRow));
    },
    async del(rid) {
      const hit = (await read()).out.find(x => x.ev.id === rid);
      if (!hit) return false;
      const m = await sheetMeta();
      await g('POST', ':batchUpdate', { requests: [{ deleteDimension: { range: { sheetId: m.gid, dimension: 'ROWS', startIndex: hit.row - 1, endIndex: hit.row } } }] });
      meta = null;
      return true;
    },
    async clear() { await g('POST', `/values/${rng('A2:I')}:clear`, {}); },
    // Conteggio dei tentativi di login sbagliati: in memoria (dura finché vive l'istanza della funzione).
    async hit(k, ttl) { const h = hits.get(k), now = Date.now(), live = h && h.exp > now; hits.set(k, { n: live ? h.n + 1 : 1, exp: live ? h.exp : now + ttl * 1000 }); return hits.get(k).n; },
    async count(k) { const h = hits.get(k); return h && h.exp > Date.now() ? h.n : 0; }
  };
}

// Legge la configurazione dalle variabili d'ambiente. null se non c'è.
function fromEnv() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, sheet = process.env.GOOGLE_SHEET_ID;
  if (!raw && !sheet) return null;
  if (!raw || !sheet) throw fail('Servono entrambe le variabili GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_SHEET_ID.');
  let creds;
  try { creds = JSON.parse(raw); } catch (e) { try { creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e2) { creds = null; } }
  if (!creds || !creds.client_email || !creds.private_key) throw fail('GOOGLE_SERVICE_ACCOUNT_JSON deve contenere il file JSON della chiave del service account, intero.');
  creds.private_key = String(creds.private_key).replace(/\\n/g, '\n');
  const m = String(sheet).match(/\/d\/([A-Za-z0-9_-]+)/); // accetta anche l'indirizzo intero del foglio
  return sheetsStore({ creds, sheetId: m ? m[1] : String(sheet).trim(), tab: process.env.SHEET_TAB || 'Log' });
}

module.exports = { sheetsStore, fromEnv, serialToDate, serialToTime };
