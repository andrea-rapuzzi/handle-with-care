// Logica dei dati: calcoli sugli eventi e parsing del CSV (per l'import). Funziona nel browser (window.Calcs) e in Node.
(function (root) {
  // CSV -> array di righe (gestisce virgolette e a capo nei campi)
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    text = String(text).replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

  // righe CSV (con intestazione) -> eventi puliti
  function loadLog(rows) {
    const out = [];
    rows.slice(1).forEach(r => {
      const d = String(r[0] || '').trim(), t = String(r[1] || '').trim(), ev = String(r[2] || '').trim();
      if (!d || !t || !ev) return;
      let y, m, dd;
      if (d.includes('-')) { const p = d.slice(0, 10).split('-').map(Number); y = p[0]; m = p[1]; dd = p[2]; }
      else { const p = d.split('/').map(Number); dd = p[0]; m = p[1]; y = p[2]; }
      const tp = t.split(':').map(Number);
      if (!y || !m || !dd || tp.length < 2 || !Number.isFinite(tp[0]) || !Number.isFinite(tp[1])) return;
      out.push({
        data: new Date(Date.UTC(y, m - 1, dd)).toISOString().slice(0, 10),
        ora: String(tp[0]).padStart(2, '0') + ':' + String(tp[1]).padStart(2, '0'),
        ts: Date.UTC(y, m - 1, dd, tp[0], tp[1]) / 60000,
        evento: ev, pipi: num(r[3]), cacca: num(r[4]),
        latte: String(r[5] || '').trim(), ml: num(r[6]), nota: String(r[7] || '')
      });
    });
    return out;
  }

  // Eventi salvati dal sito (JSON) -> stessa forma usata dai calcoli
  function fromEvents(evs) {
    return (evs || []).map(e => {
      const d = String(e.data).split('-').map(Number), t = String(e.ora).split(':').map(Number);
      return { id: e.id, data: e.data, ora: e.ora, ts: Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) / 60000,
        evento: e.evento, pipi: num(e.pipi), cacca: num(e.cacca), latte: e.latte || '', ml: num(e.ml), fine: e.fine || '', nota: e.nota || '' };
    }).filter(r => Number.isFinite(r.ts)).sort((a, b) => a.ts - b.ts);
  }

  // Poppate: se una inizia entro 60 minuti dalla precedente (a catena) diventano una sola. Le coccole non contano.
  function poppate(log) {
    const f = log.filter(r => r.evento === 'Poppata' && r.latte !== 'Coccola').sort((a, b) => a.ts - b.ts);
    const groups = [];
    f.forEach(r => { const g = groups[groups.length - 1]; if (g && r.ts - g[g.length - 1].ts <= 60) g.push(r); else groups.push([r]); });
    const endOf = r => { if (r.fine) return r.fine; const i = String(r.nota).indexOf('fino alle '); return i >= 0 ? String(r.nota).slice(i + 10, i + 15) : r.ora; };
    return groups.map(g => {
      const art = g.some(r => r.latte === 'Artificiale'), mat = g.some(r => r.latte !== 'Artificiale');
      const mlf = g.filter(r => r.latte === 'Artificiale').reduce((s, r) => s + r.ml, 0);
      const mls = g.filter(r => r.latte !== 'Artificiale').reduce((s, r) => s + r.ml, 0);
      return { data: g[0].data, ora_inizio: g[0].ora, ora_fine: endOf(g[g.length - 1]), tipo: art && mat ? 'misto' : (art ? 'formula' : 'seno'),
        ml_formula: mlf, ml_seno_misurati: mls, ml_totali: mlf + mls, registrazioni_unite: g.length };
    });
  }

  const sum = (a, k) => a.reduce((s, x) => s + Number(x[k]), 0);
  // Dal primo giorno con dati all'ultimo. Se si passa "oggi" e non ha ancora eventi, l'intervallo arriva comunque a oggi.
  const range = (log, oggi) => {
    const ds = log.map(r => Date.parse(r.data + 'T00:00:00Z'));
    const o = oggi ? Date.parse(oggi + 'T00:00:00Z') : NaN;
    return [Math.min(...ds), Math.max(...ds, Number.isFinite(o) ? o : -Infinity)];
  };

  function giornaliero(log, pop, oggi) {
    if (!log.length) return [];
    let [d, end] = range(log, oggi); const out = [];
    while (d <= end) {
      const iso = new Date(d).toISOString().slice(0, 10);
      const L = log.filter(r => r.data === iso), P = pop.filter(p => p.data === iso), pan = L.filter(r => r.evento === 'Pannolino');
      out.push({ data: iso, eventi: L.length, poppate: P.length,
        poppate_seno: P.filter(p => p.tipo === 'seno').length, poppate_formula: P.filter(p => p.tipo === 'formula').length, poppate_miste: P.filter(p => p.tipo === 'misto').length,
        ml_formula: sum(P, 'ml_formula'), ml_seno: sum(P, 'ml_seno_misurati'), ml_totali: sum(P, 'ml_totali'),
        pipi: sum(pan, 'pipi'), cacca: sum(pan, 'cacca'), cambi: pan.length, vuoti: pan.filter(r => r.pipi + r.cacca === 0).length,
        vomito: L.filter(r => r.evento === 'Vomito').length });
      d += 86400000;
    }
    return out;
  }

  function orario(log, pop, oggi) {
    if (!log.length) return [];
    let [d, end] = range(log, oggi); const out = [];
    const hr = s => Number(String(s).slice(0, 2));
    while (d <= end) {
      const iso = new Date(d).toISOString().slice(0, 10);
      for (let h = 0; h < 24; h++) {
        const P = pop.filter(p => p.data === iso && hr(p.ora_inizio) === h);
        const pan = log.filter(r => r.data === iso && r.evento === 'Pannolino' && hr(r.ora) === h);
        out.push({ data: iso, ora: h, poppate: P.length, ml: sum(P, 'ml_totali'), pipi: sum(pan, 'pipi'), cacca: sum(pan, 'cacca') });
      }
      d += 86400000;
    }
    return out;
  }

  // Medie sugli ultimi 7 giorni completi: escluso l'ultimo (in corso) e i giorni senza nessuna registrazione
  function medie(g) {
    g = g.slice(0, -1).filter(r => r.eventi > 0).slice(-7);
    const m = (rows, k) => rows.length ? rows.reduce((s, r) => s + Number(r[k]), 0) / rows.length : 0;
    const conMl = g.filter(r => (Number(r.poppate_formula) + Number(r.poppate_miste)) * 2 >= Number(r.poppate));
    return { giorni: g.length, poppate: m(g, 'poppate'), pipi: m(g, 'pipi'), cacca: m(g, 'cacca'), giorni_ml: conMl.length, ml: m(conMl, 'ml_totali') };
  }

  function fascia(o) {
    const out = [];
    for (let h = 0; h < 24; h++) {
      const r = o.filter(x => Number(x.ora) === h);
      const s = k => r.reduce((a, x) => a + Number(x[k]), 0);
      out.push({ ora: h, poppate: s('poppate'), ml: s('ml'), pipi: s('pipi'), cacca: s('cacca') });
    }
    return out;
  }

  function allFromLog(log, oggi) {
    const pop = poppate(log), g = giornaliero(log, pop, oggi), o = orario(log, pop, oggi);
    return { log, poppate: pop, giornaliero: g, orario: o, medie: medie(g), ultimo: g[g.length - 1], fascia: fascia(o) };
  }
  const all = (csvText, oggi) => allFromLog(loadLog(parseCSV(csvText)), oggi);

  // Obiettivi del giorno in base al peso (grammi). Latte: tabella per peso, con 8 poppate al giorno
  // (150-200 ml per kg al giorno). Tra due righe si interpola, poi si arrotonda a 5 ml.
  // Fuori tabella (sotto 2,5 o sopra 5 kg) vale la stessa regola dei ml per kg. Pipì: almeno 6 al giorno.
  const TABELLA = [ // kg, totale min, totale max, a poppata min, a poppata max
    [2.5, 375, 500, 45, 65], [3, 450, 600, 55, 75], [3.5, 525, 700, 65, 90],
    [4, 600, 800, 75, 100], [4.5, 675, 900, 85, 115], [5, 750, 1000, 95, 125]];
  const PIPI_MIN = 6;
  function obiettivi(grammi) {
    const kg = Number(grammi) / 1000;
    if (!(kg > 0)) return null;
    const r5 = v => Math.round(v / 5) * 5;
    const first = TABELLA[0], last = TABELLA[TABELLA.length - 1];
    let v;
    if (kg < first[0] || kg > last[0]) v = [kg, 150 * kg, 200 * kg, 150 * kg / 8, 200 * kg / 8];
    else {
      let i = 0; while (i < TABELLA.length - 2 && kg > TABELLA[i + 1][0]) i++;
      const a = TABELLA[i], b = TABELLA[i + 1], t = (kg - a[0]) / (b[0] - a[0]);
      v = a.map((x, j) => x + (b[j] - x) * t);
    }
    return { kg, ml_min: r5(v[1]), ml_max: r5(v[2]), poppata_min: r5(v[3]), poppata_max: r5(v[4]), pipi_min: PIPI_MIN, fuori_tabella: kg < first[0] || kg > last[0] };
  }


  // ---------- Peso: tendenza ----------
  // Retta dei minimi quadrati sulle pesate degli ultimi `giorni` giorni (contati dall'ultima pesata).
  // Serve almeno un giorno tra la prima e l'ultima pesata della finestra, sennò la pendenza non vuol dire nulla.
  const minuti = (data, ora) => { const d = String(data).split('-').map(Number), t = String(ora || '00:00').split(':').map(Number); return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) / 60000; };
  function trendPeso(pesi, giorni) {
    giorni = giorni || 14;
    const P = (pesi || []).map(p => ({ data: p.data, t: minuti(p.data, p.ora) / 1440, g: Number(p.grammi) })).filter(p => Number.isFinite(p.t) && p.g > 0).sort((a, b) => a.t - b.t);
    if (P.length < 2) return null;
    const fine = P[P.length - 1].t, W = P.filter(p => p.t >= fine - giorni);
    if (W.length < 2 || W[W.length - 1].t - W[0].t < 1) return null;
    const mt = W.reduce((s, p) => s + p.t, 0) / W.length, mg = W.reduce((s, p) => s + p.g, 0) / W.length;
    const b = W.reduce((s, p) => s + (p.t - mt) * (p.g - mg), 0) / W.reduce((s, p) => s + (p.t - mt) ** 2, 0);
    const y = t => mg + b * (t - mt);
    return { g_giorno: b, n: W.length, giorni, da: { data: W[0].data, t: W[0].t, g: y(W[0].t) }, a: { data: W[W.length - 1].data, t: W[W.length - 1].t, g: y(W[W.length - 1].t) } };
  }

  // ---------- Trofei ----------
  // Ogni trofeo è una soglia su un contatore (k >= n). I contatori si aggiornano evento per evento, in ordine di tempo,
  // così si sa anche il giorno in cui il trofeo è stato sbloccato. u: unità per mostrare l'avanzamento.
  const TROFEI = [
    // Poppate
    { id: 'pop1', cat: 'poppate', k: 'pop', n: 1, nome: 'Primo sorso', desc: 'La prima poppata di Enrico nel diario.' },
    { id: 'pop50', cat: 'poppate', k: 'pop', n: 50, nome: 'Buona forchetta', desc: '50 poppate: l\'appetito non manca.' },
    { id: 'pop100', cat: 'poppate', k: 'pop', n: 100, nome: 'Cliente affezionato', desc: '100 poppate al bar del latte.' },
    { id: 'pop250', cat: 'poppate', k: 'pop', n: 250, nome: 'Tessera fedeltà', desc: '250 poppate: la prossima la offre la casa.' },
    { id: 'pop1000', cat: 'poppate', k: 'pop', n: 1000, nome: 'Mille e una poppata', desc: '1000 poppate, quasi quante le notti di Sherazade.' },
    { id: 'day8', cat: 'poppate', k: 'dayPop', n: 8, nome: 'Buffet a volontà', desc: '8 poppate nello stesso giorno.' },
    { id: 'misto', cat: 'poppate', k: 'misto', n: 1, nome: 'Menù degustazione', desc: 'Una poppata con latte materno e artificiale insieme.' },
    // Latte
    { id: 'bib1', cat: 'latte', k: 'biberon', n: 1, nome: 'Primo biberon', desc: 'Il primo biberon con i millilitri annotati.' },
    { id: 'l1', cat: 'latte', k: 'ml', n: 1000, u: 'ml', nome: 'Il primo litro', desc: 'Un litro di latte bevuto dal biberon.' },
    { id: 'l10', cat: 'latte', k: 'ml', n: 10000, u: 'ml', nome: 'Secchiello', desc: '10 litri di latte: un secchiello pieno.' },
    { id: 'l50', cat: 'latte', k: 'ml', n: 50000, u: 'ml', nome: 'Acquario', desc: '50 litri: ci starebbero comodi due pesci rossi.' },
    { id: 'l100', cat: 'latte', k: 'ml', n: 100000, u: 'ml', nome: 'Vasca da bagno', desc: '100 litri di latte, abbastanza per farci il bagno.' },
    { id: 'bot100', cat: 'latte', k: 'bottle', n: 100, u: 'ml1', nome: 'Tutto d\'un fiato', desc: 'Un biberon da almeno 100 ml.' },
    { id: 'bot150', cat: 'latte', k: 'bottle', n: 150, u: 'ml1', nome: 'Pozzo senza fondo', desc: 'Un biberon da almeno 150 ml.' },
    { id: 'dayL', cat: 'latte', k: 'dayMl', n: 1000, u: 'ml1', nome: 'Litro quotidiano', desc: 'Almeno un litro di latte in un giorno solo.' },
    // Notte
    { id: 'notte1', cat: 'notte', k: 'popNotte', n: 1, nome: 'Spuntino di mezzanotte', desc: 'Una poppata tra mezzanotte e le 5.' },
    { id: 'notte50', cat: 'notte', k: 'popNotte', n: 50, nome: 'Nottambulo', desc: '50 poppate tra mezzanotte e le 5.' },
    { id: 'gap5', cat: 'notte', k: 'gapNotte', n: 300, u: 'min', nome: 'Genitori riposati', desc: '5 ore di fila senza poppate, di notte.' },
    { id: 'gap6', cat: 'notte', k: 'gapNotte', n: 360, u: 'min', nome: 'Miracolo notturno', desc: '6 ore di fila senza poppate, di notte.' },
    { id: 'gap8', cat: 'notte', k: 'gapNotte', n: 480, u: 'min', nome: 'Dormire come un ghiro', desc: '8 ore di fila senza poppate, di notte.' },
    // Pannolini
    { id: 'camb1', cat: 'pannolini', k: 'cambi', n: 1, nome: 'Battesimo del fasciatoio', desc: 'Il primo cambio di pannolino nel diario.' },
    { id: 'camb100', cat: 'pannolini', k: 'cambi', n: 100, nome: 'Centurione del fasciatoio', desc: '100 pannolini cambiati.' },
    { id: 'camb1000', cat: 'pannolini', k: 'cambi', n: 1000, nome: 'Montagna di pannolini', desc: '1000 pannolini cambiati. Applausi a chi li ha cambiati.' },
    { id: 'pipi1', cat: 'pannolini', k: 'pipi', n: 1, nome: 'Fontanella', desc: 'La prima pipì registrata.' },
    { id: 'pipi100', cat: 'pannolini', k: 'pipi', n: 100, nome: 'Idrante', desc: '100 pipì.' },
    { id: 'pipi500', cat: 'pannolini', k: 'pipi', n: 500, nome: 'Fontana di Trevi', desc: '500 pipì: lanciate una monetina.' },
    { id: 'pipi1000', cat: 'pannolini', k: 'pipi', n: 1000, nome: 'Cascate del Niagara', desc: '1000 pipì.' },
    { id: 'cacca1', cat: 'pannolini', k: 'cacca', n: 1, nome: 'Primo regalino', desc: 'La prima cacca registrata.' },
    { id: 'cacca100', cat: 'pannolini', k: 'cacca', n: 100, nome: 'Cento di questi giorni', desc: '100 cacche. Auguri!' },
    { id: 'cacca500', cat: 'pannolini', k: 'cacca', n: 500, nome: 'Leggenda del pannolino', desc: '500 cacche: se ne parlerà per generazioni.' },
    { id: 'dopp', cat: 'pannolini', k: 'doppiette', n: 1, nome: 'Doppietta', desc: 'Pipì e cacca nello stesso pannolino.' },
    { id: 'tripl', cat: 'pannolini', k: 'dayCacca', n: 3, nome: 'Tripletta', desc: '3 cacche nello stesso giorno.' },
    { id: 'manita', cat: 'pannolini', k: 'dayCacca', n: 5, nome: 'Manita', desc: '5 cacche in un giorno: cinque gol, partita chiusa.' },
    { id: 'vuoto', cat: 'pannolini', k: 'vuoti', n: 1, nome: 'Falso allarme', desc: 'Un pannolino cambiato e trovato vuoto.' },
    { id: 'idrat', cat: 'pannolini', k: 'streakPipi', n: 7, nome: 'Settimana idratata', desc: '7 giorni di fila con almeno 6 pipì.' },
    // Peso
    { id: 'peso1', cat: 'peso', k: 'pesate', n: 1, nome: 'Sulla bilancia', desc: 'La prima pesata nel diario.' },
    { id: 'peso10', cat: 'peso', k: 'pesate', n: 10, nome: 'Bilancia di fiducia', desc: '10 pesate registrate.' },
    { id: 'gain500', cat: 'peso', k: 'gain', n: 500, u: 'g', nome: 'Mezzo chilo di coccole', desc: '500 g in più rispetto alla prima pesata.' },
    { id: 'gain1k', cat: 'peso', k: 'gain', n: 1000, u: 'g', nome: 'Un chilo di felicità', desc: 'Un chilo in più rispetto alla prima pesata.' },
    { id: 'kg4', cat: 'peso', k: 'pesoMax', n: 4000, u: 'g', nome: 'Quattro chili', desc: 'Enrico supera i 4 kg.' },
    { id: 'kg5', cat: 'peso', k: 'pesoMax', n: 5000, u: 'g', nome: 'Cinque chili, cinque stelle', desc: 'Enrico supera i 5 kg.' },
    { id: 'x2', cat: 'peso', k: 'pesoX', n: 200, u: '%', nome: 'Raddoppio!', desc: 'Il doppio del peso della prima pesata.' },
    // Diario
    { id: 'g7', cat: 'diario', k: 'giorni', n: 7, nome: 'Una settimana insieme', desc: '7 giorni con almeno una registrazione.' },
    { id: 'g30', cat: 'diario', k: 'giorni', n: 30, nome: 'Un mese di diario', desc: '30 giorni con almeno una registrazione.' },
    { id: 'g100', cat: 'diario', k: 'giorni', n: 100, nome: 'Cento giorni', desc: '100 giorni con almeno una registrazione.' },
    { id: 'streak30', cat: 'diario', k: 'streak', n: 30, nome: 'Senza saltare un giorno', desc: '30 giorni di fila con almeno una registrazione.' },
    { id: 'reg1000', cat: 'diario', k: 'reg', n: 1000, nome: 'Mille righe', desc: '1000 registrazioni nel diario.' },
    { id: 'note10', cat: 'diario', k: 'note', n: 10, nome: 'Cronista', desc: '10 registrazioni con una nota scritta.' },
    { id: 'pianto1', cat: 'diario', k: 'pianti', n: 1, nome: 'Prima serenata', desc: 'Il primo pianto registrato.' },
    { id: 'vomito1', cat: 'diario', k: 'vomiti', n: 1, nome: 'Rigurgito d\'autore', desc: 'Il primo vomito registrato.' }
  ];
  const CATEGORIE = [
    { id: 'poppate', nome: 'Poppate', c: 'pop' }, { id: 'latte', nome: 'Latte', c: 'pop' }, { id: 'notte', nome: 'Notte', c: 'altro' },
    { id: 'pannolini', nome: 'Pannolini', c: 'pann' }, { id: 'peso', nome: 'Peso', c: 'peso' }, { id: 'diario', nome: 'Diario', c: 'altro' }];

  // Regole dei contatori:
  // - poppate unite come in poppate() (entro 60 minuti dalla precedente, a catena); le coccole non contano;
  // - notturna: poppata che inizia tra le 00:00 e le 04:59;
  // - pausa notturna: tempo tra due poppate se la prima è iniziata tra le 19:00 e le 03:59; oltre 12 ore non conta (diario non tenuto);
  // - giorni: date con almeno una registrazione (pesate comprese); streak: giorni consecutivi.
  function trofei(log, pesi) {
    const ev = (log || []).map(r => ({ r, key: r.data + ' ' + r.ora, p: 0 }))
      .concat((pesi || []).map(r => ({ r, key: r.data + ' ' + r.ora, p: 1 })))
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.p - b.p);
    const st = { pop: 0, dayPop: 0, misto: 0, biberon: 0, ml: 0, bottle: 0, dayMl: 0, popNotte: 0, gapNotte: 0, cambi: 0, pipi: 0, cacca: 0,
      doppiette: 0, dayCacca: 0, vuoti: 0, streakPipi: 0, pesate: 0, gain: 0, pesoMax: 0, pesoX: 0, giorni: 0, streak: 0, reg: 0, note: 0, pianti: 0, vomiti: 0 };
    const day = new Map(), dk = d => { if (!day.has(d)) day.set(d, { pop: 0, ml: 0, pipi: 0, cacca: 0, sp: 0 }); return day.get(d); };
    const prevDay = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    const done = new Map();
    let lastFeed = null, gruppo = null, primo = 0, giorno = null, run = 0;
    const max = (k, v) => { if (v > st[k]) st[k] = v; };
    ev.forEach(({ r, p }) => {
      const D = dk(r.data), t = minuti(r.data, r.ora), h = Number(String(r.ora).slice(0, 2));
      st.reg++;
      if (r.data !== giorno) { st.giorni++; run = giorno && prevDay(r.data) === giorno ? run + 1 : 1; giorno = r.data; max('streak', run); }
      if (String(r.nota || '').replace(/fino alle \d{1,2}:\d{2}/, '').trim()) st.note++;
      if (p) {
        const g = Number(r.grammi); st.pesate++;
        if (!primo) primo = g;
        max('pesoMax', g); max('gain', g - primo); max('pesoX', Math.floor(g / primo * 100));
      } else if (r.evento === 'Poppata' && r.latte !== 'Coccola') {
        if (lastFeed && t - lastFeed.t <= 60) gruppo.add(r.latte === 'Artificiale');
        else {
          if (lastFeed) { const lh = lastFeed.h, gap = t - lastFeed.t; if ((lh >= 19 || lh < 4) && gap <= 720) max('gapNotte', gap); }
          st.pop++; D.pop++; max('dayPop', D.pop); gruppo = new Set([r.latte === 'Artificiale']);
          if (h < 5) st.popNotte++;
        }
        if (gruppo.size === 2 && !gruppo.contato) { gruppo.contato = true; st.misto++; }
        lastFeed = { t, h };
        const ml = Number(r.ml) || 0;
        if (ml > 0) { st.biberon++; st.ml += ml; D.ml += ml; max('bottle', ml); max('dayMl', D.ml); }
      } else if (r.evento === 'Pannolino') {
        const pi = Number(r.pipi) || 0, ca = Number(r.cacca) || 0;
        st.cambi++; st.pipi += pi; st.cacca += ca; D.cacca += ca; max('dayCacca', D.cacca);
        if (pi > 0 && ca > 0) st.doppiette++;
        if (!pi && !ca) st.vuoti++;
        const prima = D.pipi; D.pipi += pi;
        if (prima < PIPI_MIN && D.pipi >= PIPI_MIN) { const pr = day.get(prevDay(r.data)); D.sp = (pr ? pr.sp : 0) + 1; max('streakPipi', D.sp); }
      } else if (r.evento === 'Pianto') st.pianti++;
      else if (r.evento === 'Vomito') st.vomiti++;
      TROFEI.forEach(T => { if (!done.has(T.id) && st[T.k] >= T.n) done.set(T.id, { data: r.data, i: done.size }); });
    });
    return TROFEI.map(T => { const d = done.get(T.id); return Object.assign({}, T, { ok: !!d, data: d ? d.data : null, ordine: d ? d.i : -1, v: Math.min(st[T.k], T.n) }); });
  }

  const api = { parseCSV, loadLog, fromEvents, poppate, giornaliero, orario, medie, fascia, all, allFromLog, obiettivi, TABELLA, PIPI_MIN, trendPeso, trofei, TROFEI, CATEGORIE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calcs = api;
})(typeof window !== 'undefined' ? window : globalThis);
