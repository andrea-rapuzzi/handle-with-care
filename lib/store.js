// Archivio degli eventi.
// In produzione: la scheda "Log" di un Google Sheet (lib/sheets.js).
// In locale, senza credenziali Google: un file JSON in .data/ (solo per sviluppo e test).
const fs = require('fs');
const path = require('path');

function fileStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } };
  const write = o => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o, null, 1)); };
  const hits = new Map();
  const put = async ev => { const o = read(); o[ev.id] = ev; write(o); };
  return {
    async list() { return Object.values(read()); },
    add: put, put,
    async putMany(evs) { const o = read(); evs.forEach(e => { o[e.id] = e; }); write(o); },
    async del(id) { const o = read(); if (!(id in o)) return false; delete o[id]; write(o); return true; },
    async clear() { write({}); },
    async hit(k, ttl) { const h = hits.get(k), now = Date.now(), live = h && h.exp > now; hits.set(k, { n: live ? h.n + 1 : 1, exp: live ? h.exp : now + ttl * 1000 }); return hits.get(k).n; },
    async count(k) { const h = hits.get(k); return h && h.exp > Date.now() ? h.n : 0; }
  };
}

let cached;
function store() {
  if (cached) return cached;
  const sheets = require('./sheets').fromEnv();
  if (sheets) return (cached = sheets);
  if (process.env.VERCEL) {
    const e = new Error('Foglio Google non configurato: imposta GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_SHEET_ID (vedi README).');
    e.code = 'NO_STORE'; throw e;
  }
  return (cached = fileStore(process.env.DIARIO_FILE || path.join(__dirname, '..', '.data', 'eventi.json')));
}

module.exports = { store, fileStore };
