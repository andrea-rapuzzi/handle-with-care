// Test senza dipendenze: `npm test`. Avvia il server locale su un archivio temporaneo e prova l'intero giro.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diario-'));
process.env.DIARIO_FILE = path.join(tmp, 'eventi.json');
process.env.DIARIO_PASSWORD = 'prova-123';
delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_SHEET_ID; delete process.env.DIARIO_ONLINE;

const Calcs = require('../public/calcs.js');
const E = require('../lib/events');
const crypto = require('crypto');
const { sheetsStore } = require('../lib/sheets');
const { fakeGoogle } = require('./fake-google');
const { start } = require('../dev-server');
const seed = fs.readFileSync(path.join(__dirname, '..', 'data', 'log-iniziale.csv'), 'utf8');

let n = 0;
const ok = (name) => { n++; console.log('  ok  ' + name); };

(async () => {
  // --- calcoli: il passaggio CSV -> eventi salvati -> calcoli non cambia i numeri ---
  const a = Calcs.all(seed);
  const evs = E.fromCSV(seed);
  const b = Calcs.allFromLog(Calcs.fromEvents(evs));
  assert.strictEqual(evs.length, a.log.length);
  assert.deepStrictEqual(b.medie, a.medie);
  assert.deepStrictEqual(b.giornaliero, a.giornaliero);
  assert.deepStrictEqual(b.poppate, a.poppate);
  ok(`import CSV: ${evs.length} eventi, stessi numeri del calcolo originale`);
  assert.deepStrictEqual(E.fromCSV(E.toCSV(evs)).map(e => e.id), evs.map(e => e.id));
  ok('export e reimport CSV: giro completo senza perdite');
  const ext = Calcs.allFromLog(Calcs.fromEvents(evs), '2026-11-12');
  assert.strictEqual(ext.ultimo.data, '2026-11-12'); assert.strictEqual(ext.ultimo.poppate, 0);
  assert.strictEqual(a.medie.giorni, 5); assert.strictEqual(ext.medie.giorni, 6); // 6 giorni con dati, i giorni vuoti non entrano nelle medie
  ok('oggi senza eventi: giornata a zero, giorni vuoti fuori dalle medie');

  // --- controlli sui dati ---
  assert.ok(E.clean({ data: '2026-02-30', ora: '10:00', evento: 'Pannolino' }).error);
  assert.ok(E.clean({ data: '2026-11-15', ora: '25:00', evento: 'Pannolino' }).error);
  assert.ok(E.clean({ data: '2026-11-15', ora: '10:00', evento: 'Poppata' }).error);
  assert.ok(E.clean({ data: '2026-11-15', ora: '10:00', evento: 'Poppata', latte: 'Artificiale', ml: 9999 }).error);
  assert.strictEqual(E.clean({ data: '2026-11-15', ora: '10:00', evento: 'Poppata', latte: 'Coccola', ml: 50 }).ev.ml, 0);
  ok('validazione eventi');

  // --- API ---
  const srv = await start(0); const base = 'http://localhost:' + srv.address().port;
  let cookie = '';
  const req = async (p, method, body, ip) => {
    const r = await fetch(base + p, { method: method || 'GET', headers: Object.assign({ cookie }, body ? { 'Content-Type': 'application/json' } : {}, ip ? { 'x-forwarded-for': ip } : {}), body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    return { s: r.status, j, h: r.headers };
  };
  assert.strictEqual((await req('/api/events')).s, 401);
  assert.strictEqual((await req('/api/import', 'POST', { csv: seed })).s, 401);
  assert.strictEqual((await req('/api/events', 'POST', { data: '2026-11-15', ora: '10:00', evento: 'Pannolino' })).s, 401);
  assert.strictEqual((await req('/data/log-iniziale.csv')).s, 404);
  assert.strictEqual((await req('/../lib/auth.js')).s, 404);
  ok('senza login: niente dati, niente scritture, file privati non serviti');

  assert.strictEqual((await req('/api/session', 'POST', { password: 'sbagliata' })).s, 401);
  cookie = 'diario_s=9999999999.firmafalsa';
  assert.strictEqual((await req('/api/events')).s, 401);
  cookie = '';
  const li = await req('/api/session', 'POST', { password: ' prova-123 ' });
  assert.strictEqual(li.s, 200);
  const sc = li.h.get('set-cookie'); assert.ok(/HttpOnly/.test(sc) && /SameSite=Lax/.test(sc));
  cookie = sc.split(';')[0];
  assert.strictEqual((await req('/api/session')).j.ok, true);
  ok('login: password sbagliata e cookie falso respinti, password giusta accettata');

  const p1 = await req('/api/events', 'POST', { data: '2026-11-15', ora: '03:10', evento: 'Pannolino', pipi: 1, cacca: 2, nota: ' anche addosso ' });
  assert.strictEqual(p1.s, 201); assert.strictEqual(p1.j.cacca, 2); assert.strictEqual(p1.j.nota, 'anche addosso');
  const p2 = await req('/api/events', 'POST', { data: '2026-11-15', ora: '03:20', evento: 'Poppata', latte: 'Artificiale', ml: 60, fine: '03:45' });
  assert.strictEqual(p2.s, 201);
  assert.strictEqual((await req('/api/events', 'POST', { data: '2026-11-15', ora: '03:20', evento: 'Boh' })).s, 400);
  const up = await req('/api/events?id=' + p2.j.id, 'PUT', { data: '2026-11-15', ora: '03:25', evento: 'Poppata', latte: 'Artificiale', ml: 90 });
  assert.strictEqual(up.s, 200); assert.strictEqual(up.j.ml, 90); assert.strictEqual(up.j.creato, p2.j.creato);
  assert.strictEqual((await req('/api/events?id=non-esiste', 'PUT', { data: '2026-11-15', ora: '03:25', evento: 'Vomito' })).s, 404);
  let all = (await req('/api/events')).j; assert.strictEqual(all.length, 2); assert.strictEqual(all[1].ora, '03:25');
  assert.strictEqual((await req('/api/events?id=' + p1.j.id, 'DELETE')).s, 200);
  assert.strictEqual((await req('/api/events?id=' + p1.j.id, 'DELETE')).s, 404);
  ok('crea, modifica, elimina');

  const i1 = await req('/api/import', 'POST', { csv: seed });
  assert.strictEqual(i1.s, 200); assert.strictEqual(i1.j.totale, evs.length + 1);
  const i2 = await req('/api/import', 'POST', { csv: seed });
  assert.strictEqual(i2.j.totale, evs.length + 1); assert.strictEqual(i2.j.nuovi, 0);
  const i3 = await req('/api/import', 'POST', { csv: seed, modo: 'sostituisci' });
  assert.strictEqual(i3.j.totale, evs.length);
  assert.strictEqual((await req('/api/import', 'POST', { csv: 'ciao' })).s, 400);
  const csv = await req('/api/events?format=csv');
  assert.ok(/text\/csv/.test(csv.h.get('content-type'))); assert.strictEqual(E.fromCSV(csv.j).length, evs.length);
  ok('import: aggiunge senza doppioni, sostituisce su richiesta; export CSV');

  assert.strictEqual((await req('/api/session', 'DELETE')).s, 200);
  let last; for (let i = 0; i < 10; i++) last = await req('/api/session', 'POST', { password: 'no' + i }, '203.0.113.9');
  assert.strictEqual(last.s, 429);
  assert.strictEqual((await req('/api/session', 'POST', { password: 'prova-123' }, '203.0.113.9')).s, 429);
  assert.strictEqual((await req('/api/session', 'POST', { password: 'prova-123' }, '203.0.113.10')).s, 200);
  ok('dopo 10 password sbagliate quell\'indirizzo resta bloccato, gli altri no');
  srv.close();

  // --- archivio su Google Sheet, contro un finto Google ---
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const email = 'diario@progetto.iam.gserviceaccount.com';
  // Foglio come quello vero: date e ore come numeri, colonna I vuota, formule da J in poi.
  const ser = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000 + 25569;
  const frac = o => (+o.slice(0, 2) * 60 + +o.slice(3, 5)) / 1440;
  const foglio = [['Data', 'Ora', 'Evento', 'Pipì', 'Cacca', 'Latte', 'ml', 'Note', '', 'Data e ora']].concat(
    Calcs.parseCSV(seed).slice(1).filter(r => r[0]).map(r => [ser(r[0]), frac(r[1]), r[2], r[3] === '' ? '' : +r[3], r[4] === '' ? '' : +r[4], r[5], r[6] === '' ? '' : +r[6], r[7]]));
  const G = await fakeGoogle({ publicKey, email, seed: foglio, rowCount: 110 });
  const mk = (over) => sheetsStore(Object.assign({ creds: { client_email: email, private_key: privateKey }, sheetId: 'FOGLIO', apiBase: G.url, tokenUrl: G.url + '/token' }, over));
  const Sh = mk();

  let l1 = await Sh.list();
  assert.strictEqual(l1.length, evs.length);
  assert.deepStrictEqual(Calcs.allFromLog(Calcs.fromEvents(l1)).giornaliero, a.giornaliero);
  assert.strictEqual(G.state.grid[0][8], 'ID'); assert.ok(G.state.grid.slice(1, 105).every(r => r[8]));
  const writes = () => G.state.calls.filter(x => !x.startsWith('GET')).length, w0 = writes();
  const l2 = await Sh.list();
  assert.deepStrictEqual(l2.map(e => e.id), l1.map(e => e.id)); assert.strictEqual(writes(), w0);
  ok('foglio: legge date e ore numeriche, stessi numeri del CSV, assegna gli ID una volta sola');

  const nuovo = E.clean({ data: '2026-11-15', ora: '03:20', evento: 'Poppata', latte: 'Artificiale', ml: 60, fine: '03:45', nota: '=1+1 poi 1/2' }).ev; nuovo.id = 'n1';
  await Sh.add(nuovo);
  const r106 = G.state.grid[105];
  assert.strictEqual(r106[0], ser('2026-11-15')); assert.strictEqual(r106[2], 'Poppata'); assert.strictEqual(r106[6], 60);
  assert.strictEqual(r106[7], 'fino alle 03:45, =1+1 poi 1/2'); assert.strictEqual(r106[8], 'n1'); assert.strictEqual(r106[9], 'f');
  const back = (await Sh.list()).find(e => e.id === 'n1');
  assert.deepStrictEqual(back, nuovo);
  ok('foglio: una nuova riga torna identica, la nota resta testo, le formule non vengono toccate');

  await Sh.put(Object.assign({}, nuovo, { ml: 90, ora: '03:25' }));
  assert.strictEqual(G.state.grid[105][6], 90); assert.strictEqual((await Sh.list()).length, evs.length + 1);
  const terza = l1[2];
  assert.strictEqual(await Sh.del(terza.id), true); assert.strictEqual(await Sh.del(terza.id), false);
  const l3 = await Sh.list();
  assert.strictEqual(l3.length, evs.length); assert.ok(!l3.some(e => e.id === terza.id)); assert.strictEqual(l3[2].id, l1[3].id);
  ok('foglio: modifica ed elimina la riga giusta');

  // righe aggiunte a mano nel foglio: senza ID, con ID copiato da un'altra riga, e una riga vuota in mezzo
  const g = G.state.grid, n0 = g.length;
  G.state.rowCount = 200;
  const manuale = (i, vals) => { while (g.length < i) g.push(['', '', '', '', '', '', '', '', '', 'f', 'f', 'f']); vals.forEach((v, c) => { g[i - 1][c] = v; }); };
  manuale(n0 + 2, [ser('2026-11-15'), frac('04:00'), 'Pannolino', 1, 0, '', '', 'a mano']);
  manuale(n0 + 3, ['15/11/2026', '4:30:00', 'Pannolino', '0', '1', '', '', 'testo', l3[0].id]);
  const l4 = await Sh.list();
  assert.strictEqual(l4.length, evs.length + 2);
  const m1 = l4.find(e => e.nota === 'a mano'), m2 = l4.find(e => e.nota === 'testo');
  assert.ok(m1.id && m2.id && m2.id !== l3[0].id && m2.ora === '04:30' && m2.data === '2026-11-15' && m2.cacca === 1);
  assert.strictEqual(g[n0 + 1][8], m1.id);
  ok('foglio: le righe scritte a mano vengono lette e ricevono un ID, anche se copiate');

  const G2rows = G.state.rowCount = g.length; // griglia piena: l'import deve allargarla
  await Sh.putMany(E.fromCSV('Data,Ora,Evento,Pipi,Cacca,Latte,ml,Note\n2026-11-16,01:00,Vomito,,,,,\n2026-11-16,02:00,Pianto,,,,,gas\n'));
  assert.strictEqual(G.state.rowCount, G2rows + 2); assert.strictEqual((await Sh.list()).length, evs.length + 4);
  await Sh.clear();
  assert.strictEqual((await Sh.list()).length, 0); assert.strictEqual(g[0][0], 'Data'); assert.strictEqual(g[0][9], 'Data e ora'); assert.ok(g.slice(1).every(r => r[9] === 'f'));
  await Sh.add(nuovo); assert.strictEqual(g[1][8], 'n1');
  ok('foglio: import oltre la fine della griglia, svuotamento che conserva intestazione e formule');

  G.state.writable = false; g[1][8] = '';
  await assert.rejects(Sh.list(), e => e.code === 'NO_STORE' && /Editor/.test(e.message));
  await assert.rejects(mk({ sheetId: 'ALTRO' }).list(), e => e.code === 'NO_STORE' && /GOOGLE_SHEET_ID/.test(e.message));
  await assert.rejects(mk({ tab: 'Manca' }).list(), e => e.code === 'NO_STORE' && /scheda/.test(e.message));
  const altra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  await assert.rejects(mk({ creds: { client_email: email, private_key: altra } }).list(), e => e.code === 'NO_STORE' && /service account/.test(e.message));
  ok('foglio: errori di configurazione spiegati in chiaro');
  G.srv.close();

  // --- adattatore Netlify: stessi handler, chiamati con l'evento della funzione ---
  const { handler } = require('../netlify/functions/api');
  const SEC = require('../lib/headers');
  const ev = (p, method, body, extra) => handler(Object.assign({ path: p, httpMethod: method || 'GET', headers: { Cookie: nfCookie }, rawQuery: '', body: body ? JSON.stringify(body) : null, isBase64Encoded: false }, extra));
  let nfCookie = '';
  assert.strictEqual((await ev('/api/events')).statusCode, 401);
  assert.strictEqual((await ev('/.netlify/functions/api')).statusCode, 404);
  assert.strictEqual((await ev('/api/constructor')).statusCode, 404);
  const nl = await ev('/api/session', 'POST', { password: 'prova-123' });
  assert.strictEqual(nl.statusCode, 200); assert.ok(/; Secure/.test(nl.headers['Set-Cookie']));
  nfCookie = nl.headers['Set-Cookie'].split(';')[0];
  const nb = { data: '2026-11-17', ora: '08:15', evento: 'Pannolino', pipi: 1 };
  const np = await ev('/api/events', 'POST', null, { body: Buffer.from(JSON.stringify(nb)).toString('base64'), isBase64Encoded: true });
  assert.strictEqual(np.statusCode, 201);
  const nid = JSON.parse(np.body).id;
  assert.ok(JSON.parse((await ev('/api/events')).body).some(e => e.id === nid));
  const nc = await ev('/api/events', 'GET', null, { rawQuery: 'format=csv' });
  assert.ok(/text\/csv/.test(nc.headers['Content-Type']) && nc.body.includes('2026-11-17'));
  assert.strictEqual((await ev('/api/events', 'DELETE', null, { rawQuery: undefined, queryStringParameters: { id: nid } })).statusCode, 200);
  Object.entries(SEC).forEach(([k, v]) => assert.strictEqual(np.headers[k], v));
  const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
  Object.entries(SEC).forEach(([k, v]) => assert.ok(toml.includes(`${k} = "${v}"`), 'netlify.toml: manca ' + k));
  delete process.env.DIARIO_ONLINE;
  ok('Netlify: adattatore (login, query, corpo base64, percorsi sconosciuti) e header allineati a netlify.toml');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${n} gruppi di test passati.`);
})().catch(e => { console.error('\nFALLITO:', e); process.exit(1); });
