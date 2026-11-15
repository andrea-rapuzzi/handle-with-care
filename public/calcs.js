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

  const api = { parseCSV, loadLog, fromEvents, poppate, giornaliero, orario, medie, fascia, all, allFromLog, obiettivi, TABELLA, PIPI_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Calcs = api;
})(typeof window !== 'undefined' ? window : globalThis);
