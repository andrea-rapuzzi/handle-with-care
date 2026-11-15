// Archivio su Google Sheet: la scheda "Log" del foglio è il database.
// Colonne A:H come nel foglio originale (Data, Ora, Evento, Pipì, Cacca, Latte, ml, Note), colonna I = ID della riga.
// Le colonne da J in poi (formule del foglio) non vengono mai scritte.
// Accesso con un service account Google (JWT firmato qui, nessuna libreria).
const crypto = require('crypto');
const Calcs = require('../public/calcs.js');
const E = require('./events');
const P = require('./pesi');

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const fail = (msg) => { const e = new Error(msg); e.code = 'NO_STORE'; return e; };

// Numero seriale di Sheets -> 'YYYY-MM-DD' / 'HH:MM' (le celle data e ora sono numeri, qualunque sia la lingua del foglio)
const serialToDate = n => new Date(Math.round((Math.floor(n) - 25569) * 86400000)).toISOString().slice(0, 10);
const serialToTime = n => { const m = Math.round((n - Math.floor(n)) * 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const txt = v => "'" + v; // l'apostrofo iniziale dice a Sheets "questo è testo": niente formule o date indovinate nelle note

// Connessione al foglio: token del service account e chiamate all'API. Condivisa tra la scheda Log e la scheda Peso.
function client(opts) {
  const creds = opts.creds, id = opts.sheetId;
  const api = (opts.apiBase || 'https://sheets.googleapis.com') + '/v4/spreadsheets/' + id;
  const tokenUrl = opts.tokenUrl || 'https://oauth2.googleapis.com/token';
  let tok = null;

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

  // tab: solo per spiegare l'errore se la scheda manca
  async function g(method, path, body, tab) {
    const r = await fetch(api + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + await token() }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    const m = (j.error && j.error.message) || String(r.status);
    if (r.status === 403) throw fail(`Il foglio non è condiviso come Editor con ${creds.client_email} (oppure l'API Google Sheets non è attiva nel progetto Google Cloud). Dettaglio: ${m}`);
    if (r.status === 404) throw fail('Foglio non trovato: controlla GOOGLE_SHEET_ID.');
    if (r.status === 400 && /parse range/i.test(m)) throw fail(`Nel foglio manca la scheda "${tab}".`);
    throw new Error('Google Sheets: ' + m);
  }

  // Elenco delle schede: { titolo: { gid, rows } }
  async function tabs() {
    const j = await g('GET', '?fields=' + encodeURIComponent('sheets.properties(sheetId,title,gridProperties.rowCount)'));
    const out = {};
    (j.sheets || []).forEach(x => { const p = x.properties; out[p.title] = { gid: p.sheetId, rows: (p.gridProperties && p.gridProperties.rowCount) || 0 }; });
    return out;
  }

  return { g, tabs };
}

// Crea la scheda (con l'intestazione) se nel foglio non c'è ancora. Restituisce { gid, rows }.
async function ensureTab(c, tab, head) {
  const s = (await c.tabs())[tab];
  if (s) return s;
  const j = await c.g('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: tab, gridProperties: { rowCount: 200, columnCount: head.length, frozenRowCount: 1 } } } }] }, tab);
  const pr = j.replies && j.replies[0] && j.replies[0].addSheet && j.replies[0].addSheet.properties;
  await c.g('PUT', `/values/${rangeOf(tab)('A1:' + String.fromCharCode(64 + head.length) + '1')}?valueInputOption=RAW`, { values: [head] }, tab);
  return { gid: pr ? pr.sheetId : null, rows: 200 };
}

const rangeOf = tab => a1 => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${a1}`);
// L'ora va scritta come numero (frazione di giorno): in un foglio in italiano il testo "19:30" non viene
// riconosciuto come orario, resta testo e manda in errore le formule.
const frac = hm => { const [h, m] = String(hm).split(':').map(Number); return (h * 60 + m) / 1440; };

function sheetsStore(opts) {
  const tab = opts.tab || 'Log', c = opts.client || client(opts);
  const rng = rangeOf(tab), g = (m, p, b) => c.g(m, p, b, tab);
  let meta = null;
  const hits = new Map();

  const toRow = e => { const r = E.toRow(e); r[1] = frac(r[1]); r[7] = r[7] ? txt(r[7]) : ''; r.push(txt(e.id)); return r; };
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
    const s = (await c.tabs())[tab];
    if (!s) throw fail(`Nel foglio manca la scheda "${tab}".`);
    return (meta = s);
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

// Scheda "Peso": Data, Ora, Peso (g), Note, ID. Separata da Log, così le formule delle schede Giorni e Orario
// non vedono le pesate. Se manca, il sito la crea alla prima lettura.
const PESO_HEAD = ['Data', 'Ora', 'Peso (g)', 'Note', 'ID'];

function pesiStore(opts) {
  const tab = opts.tab || 'Peso', c = opts.client || client(opts);
  const rng = rangeOf(tab), g = (m, p, b) => c.g(m, p, b, tab);
  let meta = null;

  async function sheetMeta() {
    if (meta) return meta;
    return (meta = await ensureTab(c, tab, PESO_HEAD));
  }

  const toRow = p => [p.data, frac(p.ora), p.grammi, p.nota ? txt(p.nota) : '', txt(p.id)];

  async function read() {
    await sheetMeta();
    const j = await g('GET', `/values/${rng('A2:E')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
    const out = [], fix = [], seen = new Set();
    (j.values || []).forEach((r, i) => {
      let data = r[0], ora = r[1] == null || r[1] === '' ? '00:00' : r[1];
      if (typeof data === 'number') data = serialToDate(data);
      else { const dm = String(data == null ? '' : data).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (dm) data = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`; }
      if (typeof ora === 'number') ora = serialToTime(ora);
      // a mano si scrive facilmente "3,45" (kg) invece di 3450 (g)
      let gr = typeof r[2] === 'number' ? r[2] : Number(String(r[2] == null ? '' : r[2]).replace(',', '.'));
      if (gr > 0 && gr < 30) gr = gr * 1000;
      const hm = String(ora).trim().match(/^(\d{1,2})[:.](\d{2})/);
      const cl = P.clean({ data: String(data == null ? '' : data).trim(), ora: hm ? hm[1].padStart(2, '0') + ':' + hm[2] : '', grammi: Math.round(gr), nota: r[3] == null ? '' : String(r[3]) });
      if (cl.error) return;
      let rid = String(r[4] == null ? '' : r[4]).trim();
      if (!rid || seen.has(rid)) { rid = crypto.randomUUID(); fix.push({ range: `'${tab}'!E${i + 2}`, values: [[rid]] }); }
      seen.add(rid); cl.p.id = rid;
      out.push({ row: i + 2, p: cl.p });
    });
    if (fix.length) await g('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: fix });
    return out;
  }

  return {
    async list() { return (await read()).map(x => x.p); },
    async add(p) { await sheetMeta(); await g('POST', `/values/${rng('A:E')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`, { values: [toRow(p)] }); },
    async put(p) {
      const hit = (await read()).find(x => x.p.id === p.id);
      if (!hit) return this.add(p);
      await g('PUT', `/values/${rng(`A${hit.row}:E${hit.row}`)}?valueInputOption=USER_ENTERED`, { values: [toRow(p)] });
    },
    async del(rid) {
      const hit = (await read()).find(x => x.p.id === rid);
      if (!hit) return false;
      const m = await sheetMeta();
      await g('POST', ':batchUpdate', { requests: [{ deleteDimension: { range: { sheetId: m.gid, dimension: 'ROWS', startIndex: hit.row - 1, endIndex: hit.row } } }] });
      return true;
    }
  };
}

// Scheda "Trofei": i trofei sbloccati, una riga per trofeo. Una volta scritti restano, anche se poi si cancellano dati.
// Si aggiungono soltanto: il sito non modifica né cancella queste righe. Se manca, il sito la crea.
const TROFEI_HEAD = ['ID', 'Trofeo', 'Descrizione', 'Sbloccato il', 'Registrato il'];

function trofeiStore(opts) {
  const tab = opts.tab || 'Trofei', c = opts.client || client(opts);
  const rng = rangeOf(tab), g = (m, p, b) => c.g(m, p, b, tab);
  let ready = false;
  const ensure = async () => { if (!ready) { await ensureTab(c, tab, TROFEI_HEAD); ready = true; } };
  return {
    async list() {
      await ensure();
      const j = await g('GET', `/values/${rng('A2:E')}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
      const out = [], seen = new Set();
      (j.values || []).forEach(r => {
        const id = String(r[0] == null ? '' : r[0]).trim();
        let data = r[3];
        if (typeof data === 'number') data = serialToDate(data);
        data = String(data == null ? '' : data).trim();
        if (!id || seen.has(id)) return;
        seen.add(id); out.push({ id, data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : '' });
      });
      return out;
    },
    // Tutte le righe in un solo append: atomico, come per la scheda Log
    async addMany(ts) {
      if (!ts.length) return;
      await ensure();
      await g('POST', `/values/${rng('A:E')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`,
        { values: ts.map(t => [txt(t.id), txt(t.nome), txt(t.desc), t.data, txt(t.registrato)]) });
    }
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
  const c = client({ creds, sheetId: m ? m[1] : String(sheet).trim() });
  return { eventi: sheetsStore({ client: c, tab: process.env.SHEET_TAB || 'Log' }), pesi: pesiStore({ client: c }), trofei: trofeiStore({ client: c }) };
}

module.exports = { client, sheetsStore, pesiStore, trofeiStore, fromEnv, serialToDate, serialToTime };
