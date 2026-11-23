// Scarica dal sito online una copia dei dati (eventi, pesate, trofei) in .data/, per provare grafici e calcoli in locale.
// Solo lettura: sul sito fa il login e tre GET, il foglio Google non viene mai toccato.
// Uso: npm run scarica   (chiede indirizzo del sito e password; l'indirizzo viene ricordato in .data/sito.txt)
// Facoltativi: DIARIO_URL=https://... e DIARIO_PASSWORD_ONLINE=... per non doverli scrivere.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DIR = path.join(__dirname, '..', '.data');
const SITO = path.join(DIR, 'sito.txt');

function chiedi(domanda, nascosta) {
  return new Promise(ok => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (nascosta) rl._writeToOutput = s => { if (s.includes(domanda)) process.stdout.write(s); };
    rl.question(domanda, r => { rl.close(); if (nascosta) process.stdout.write('\n'); ok(r.trim()); });
  });
}

async function main() {
  let url = process.env.DIARIO_URL;
  if (!url) try { url = fs.readFileSync(SITO, 'utf8').trim(); } catch (e) { if (e.code !== 'ENOENT') console.log(`Non riesco a leggere ${SITO}: ${e.message}`); }
  if (!url) url = await chiedi('Indirizzo del sito (es. https://nome.netlify.app): ');
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  const pw = process.env.DIARIO_PASSWORD_ONLINE || await chiedi('Password del sito: ', true);

  const login = await fetch(url + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  if (!login.ok) throw new Error(`Login non riuscito (${login.status}): ${(await login.json().catch(() => ({}))).error || 'risposta inattesa'}`);
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : [login.headers.get('set-cookie')]).filter(Boolean).map(c => c.split(';')[0]).join('; ');
  const get = async p => {
    const r = await fetch(url + p, { headers: { Cookie: cookie } });
    if (!r.ok) throw new Error(`${p}: errore ${r.status}`);
    return r.json();
  };
  const [eventi, pesi, trofei] = await Promise.all([get('/api/events'), get('/api/pesi'), get('/api/trofei')]);

  // I file attuali vanno in una copia di riserva, poi vengono sostituiti
  fs.mkdirSync(DIR, { recursive: true });
  const file = { 'eventi.json': eventi, 'pesi.json': pesi, 'trofei.json': trofei };
  const esistenti = Object.keys(file).filter(f => fs.existsSync(path.join(DIR, f)));
  if (esistenti.length) {
    const bk = path.join(DIR, 'backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
    fs.mkdirSync(bk);
    esistenti.forEach(f => fs.copyFileSync(path.join(DIR, f), path.join(bk, f)));
    console.log('Copia dei dati locali precedenti in', path.relative(process.cwd(), bk));
  }
  for (const [f, list] of Object.entries(file)) fs.writeFileSync(path.join(DIR, f), JSON.stringify(Object.fromEntries(list.map(x => [x.id, x])), null, 1));
  fs.writeFileSync(SITO, url + '\n');
  console.log(`Scaricati ${eventi.length} eventi, ${pesi.length} pesate, ${trofei.length} trofei da ${url}.`);
  console.log('Riavvia npm run dev (o ricarica la pagina) per vederli.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
