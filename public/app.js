(function () {
  const COLORS = [0, 1, 2, 3, 4, 5].map(i => `var(--c${i})`);
  const C = i => COLORS[i % COLORS.length];
  const fmtD = (opts, s) => new Intl.DateTimeFormat('it', Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(s + 'T00:00:00Z'));
  const dayShort = s => fmtD({ weekday: 'short', day: 'numeric' }, s);
  const dayNum = s => fmtD({ day: 'numeric' }, s);
  const dayLong = s => fmtD({ weekday: 'long', day: 'numeric', month: 'long' }, s);
  const n0 = new Intl.NumberFormat('it', { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat('it', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const int = v => n0.format(+v), dec = v => n1.format(+v);
  const n3 = new Intl.NumberFormat('it', { maximumFractionDigits: 3 });
  const kg = g => n3.format(g / 1000) + ' kg';
  const MET = { poppate: { label: 'poppate', c: 0, k: 'pop' }, ml: { label: 'ml', c: 0, k: 'pop' }, pipi: { label: 'pipì', c: 3, k: 'pann' }, cacca: { label: 'cacca', c: 4, k: 'pann' } };
  const state = { metric: 'poppate', data: null, pesi: [], trofei: [], openDays: new Set(), shown: 14, tab: 'registra', editing: null, group: null };
  const $ = id => document.getElementById(id);

  function axisText(g, x, y, txt, anchor) {
    return g.append('text').attr('x', x).attr('y', y).attr('text-anchor', anchor || 'middle').attr('font-size', 11).attr('fill', 'var(--muted)').text(txt);
  }
  function mkTip(el) { const t = document.createElement('div'); t.className = 'lx-tt'; el.append(t); return t; }
  function showTip(el, t, cx, title, lines) {
    t.replaceChildren();
    const h = document.createElement('div'); h.className = 'lx-tt-h'; h.textContent = title; t.append(h);
    lines.forEach(l => { const d = document.createElement('div'); if (l.c != null) { const s = document.createElement('i'); s.className = 'lx-sw'; s.style.background = C(l.c); d.append(s); } d.append(document.createTextNode(l.text)); t.append(d); });
    t.style.opacity = 1;
    const W = el.clientWidth, w = t.offsetWidth;
    t.style.left = Math.max(0, Math.min(W - w, cx - w / 2)) + 'px'; t.style.top = '-8px'; t.style.transform = 'translateY(-100%)';
  }

  function barChart(el, o) {
    el.replaceChildren();
    const w = Math.max(300, el.clientWidth || 300), h = o.h || 230, m = { t: 20, r: 6, b: 24, l: 32 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', o.label);
    const keys = o.rows.map(r => String(r[o.key]));
    const x = d3.scaleBand().domain(keys).range([m.l, w - m.r]).padding(o.pad || .3);
    const val = (r, k) => +r[k];
    const tot = r => o.series.reduce((s, k) => s + val(r, k.key), 0);
    const max = o.stacked ? d3.max(o.rows, tot) : d3.max(o.rows, r => d3.max(o.series, k => val(r, k.key)));
    const y = d3.scaleLinear().domain([0, max || 1]).nice().range([h - m.b, m.t]);
    const gg = svg.append('g');
    y.ticks(4).forEach(tk => { gg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(tk)).attr('y2', y(tk)).attr('stroke', 'var(--grid)'); axisText(gg, m.l - 6, y(tk) + 4, int(tk), 'end'); });
    keys.forEach((k, i) => { const lab = o.xLab(k, i); if (lab) axisText(gg, x(k) + x.bandwidth() / 2, h - 6, lab); });
    const bars = svg.append('g');
    o.rows.forEach(r => {
      const k = String(r[o.key]);
      if (o.stacked) {
        let acc = 0;
        o.series.forEach(s => { const v = val(r, s.key); if (v > 0) bars.append('rect').attr('x', x(k)).attr('width', x.bandwidth()).attr('y', y(acc + v)).attr('height', y(acc) - y(acc + v)).attr('rx', 2).attr('fill', C(s.c)).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5); acc += v; });
        if (o.totals && acc > 0) axisText(bars, x(k) + x.bandwidth() / 2, y(acc) - 5, int(acc));
      } else {
        const x1 = d3.scaleBand().domain(o.series.map(s => s.key)).range([x(k), x(k) + x.bandwidth()]).padding(.12);
        o.series.forEach(s => { const v = val(r, s.key); bars.append('rect').attr('x', x1(s.key)).attr('width', x1.bandwidth()).attr('y', y(v)).attr('height', Math.max(0, y(0) - y(v))).attr('rx', 2).attr('fill', C(s.c)); if (o.totals && v > 0) axisText(bars, x1(s.key) + x1.bandwidth() / 2, y(v) - 4, int(v)); });
      }
    });
    const t = mkTip(el), hit = svg.append('g');
    o.rows.forEach(r => {
      const k = String(r[o.key]);
      hit.append('rect').attr('x', x(k) - (x.step() - x.bandwidth()) / 2).attr('y', m.t).attr('width', x.step()).attr('height', h - m.t - m.b).attr('fill', 'transparent')
        .on('pointermove pointerenter', () => showTip(el, t, x(k) + x.bandwidth() / 2, o.tipTitle(k), o.series.map(s => ({ c: s.c, text: `${s.name}: ${int(val(r, s.key))}${o.unit || ''}` }))))
        .on('pointerleave', () => { t.style.opacity = 0; });
    });
  }

  function heat(el, orario) {
    el.replaceChildren();
    const M = MET[state.metric];
    const rows = orario.map(r => ({ d: r.data, h: +r.ora, v: +r[state.metric] }));
    const days = Array.from(new Set(rows.map(r => r.d)));
    const w = Math.max(300, el.clientWidth || 300), m = { t: 20, r: 40, b: 4, l: 46 };
    const cw = (w - m.l - m.r) / 24, ch = 26, h = m.t + days.length * ch + m.b;
    const max = d3.max(rows, r => r.v) || 1;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', `Mappa di ${M.label} per giorno e ora`);
    for (let hr = 0; hr < 24; hr += 3) axisText(svg, m.l + hr * cw + cw / 2, m.t - 6, String(hr).padStart(2, '0'));
    days.forEach((d, i) => axisText(svg, m.l - 8, m.t + i * ch + ch / 2 + 4, dayShort(d), 'end'));
    axisText(svg, w - 2, m.t - 6, 'Tot.', 'end');
    days.forEach((d, i) => axisText(svg, w - 2, m.t + i * ch + ch / 2 + 4, int(d3.sum(rows.filter(r => r.d === d), r => r.v)), 'end').attr('font-weight', 600).attr('fill', 'var(--fg)'));
    const t = mkTip(el);
    rows.forEach(r => {
      const i = days.indexOf(r.d), cx = m.l + r.h * cw, cy = m.t + i * ch;
      const rect = svg.append('rect').attr('x', cx + 1).attr('y', cy + 1).attr('width', Math.max(1, cw - 2)).attr('height', ch - 2).attr('rx', 3);
      if (r.v > 0) rect.attr('fill', C(M.c)).attr('fill-opacity', .18 + .62 * r.v / max); else rect.attr('fill', 'var(--line)').attr('fill-opacity', .4);
      if (r.v > 0 && cw >= 17) svg.append('text').attr('x', cx + cw / 2).attr('y', cy + ch / 2 + 4).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', 'var(--fg)').attr('pointer-events', 'none').text(int(r.v));
      rect.on('pointermove pointerenter', () => showTip(el, t, cx + cw / 2, `${dayLong(r.d)}, ${String(r.h).padStart(2, '0')}:00`, [{ c: M.c, text: `${int(r.v)} ${M.label}` }])).on('pointerleave', () => { t.style.opacity = 0; });
    });
  }

  // Peso: pesate come punti uniti da una linea, più la retta di tendenza tratteggiata
  function pesoChart(el, pesi, tr) {
    el.replaceChildren();
    if (!pesi.length) { const p = document.createElement('p'); p.className = 'lx-fail'; p.textContent = 'Ancora nessuna pesata: registrala dalla scheda Registra.'; el.append(p); return; }
    const w = Math.max(300, el.clientWidth || 300), h = 230, m = { t: 16, r: 12, b: 24, l: 44 };
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img').attr('aria-label', 'Andamento del peso nel tempo');
    const T = p => new Date(p.ts * 60000);
    let [t0, t1] = d3.extent(pesi, T);
    if (+t1 - +t0 < 2 * 86400000) { t0 = new Date(+t0 - 86400000); t1 = new Date(+t1 + 86400000); }
    const x = d3.scaleUtc().domain([t0, t1]).range([m.l + 8, w - m.r - 8]);
    const lo = d3.min(pesi, p => p.grammi), hi = d3.max(pesi, p => p.grammi), padY = Math.max(100, (hi - lo) * .15);
    const y = d3.scaleLinear().domain([lo - padY, hi + padY]).nice().range([h - m.b, m.t]);
    const gg = svg.append('g');
    y.ticks(4).forEach(tk => { gg.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(tk)).attr('y2', y(tk)).attr('stroke', 'var(--grid)'); axisText(gg, m.l - 6, y(tk) + 4, n1.format(tk / 1000), 'end'); });
    axisText(gg, m.l - 6, m.t - 4, 'kg', 'end');
    x.ticks(Math.max(2, Math.min(6, Math.floor(w / 90)))).forEach(d => axisText(gg, x(d), h - 6, fmtD({ day: 'numeric', month: 'short' }, d.toISOString().slice(0, 10))));
    if (tr) {
      const at = t => x(new Date(t * 86400000));
      svg.append('line').attr('x1', at(tr.da.t)).attr('x2', at(tr.a.t)).attr('y1', y(tr.da.g)).attr('y2', y(tr.a.g))
        .attr('stroke', 'var(--fg)').attr('stroke-opacity', .55).attr('stroke-width', 2).attr('stroke-dasharray', '6 5').attr('stroke-linecap', 'round');
    }
    svg.append('path').attr('d', d3.line().x(p => x(T(p))).y(p => y(p.grammi))(pesi)).attr('fill', 'none').attr('stroke', C(5)).attr('stroke-width', 2.5).attr('stroke-linejoin', 'round');
    const t = mkTip(el);
    pesi.forEach((p, i) => {
      const cx = x(T(p)), cy = y(p.grammi), prev = pesi[i - 1];
      svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4.5).attr('fill', C(5)).attr('stroke', 'var(--panel)').attr('stroke-width', 2);
      const lines = [{ c: 5, text: kg(p.grammi) }];
      if (prev) { const d = p.grammi - prev.grammi; lines.push({ text: `${d >= 0 ? '+' : '−'}${int(Math.abs(d))} g dalla pesata prima` }); }
      svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 16).attr('fill', 'transparent')
        .on('pointermove pointerenter', () => showTip(el, t, cx, `${dayLong(p.data)}, ${p.ora}`, lines)).on('pointerleave', () => { t.style.opacity = 0; });
    });
  }

  // ---------- util ----------
  const pad = n => String(n).padStart(2, '0');
  function adesso() {
    const d = new Date();
    return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, ora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      ts: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 60000 };
  }
  function fa(min) {
    if (min < 0) return 'più tardi';
    if (min < 1) return 'adesso';
    if (min < 60) return `${min} min fa`;
    if (min < 48 * 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min fa` : `${h} h fa`; }
    return `${Math.floor(min / 1440)} giorni fa`;
  }
  const bind = (k, v) => document.querySelectorAll(`[data-b="${k}"]`).forEach(e => { e.textContent = v; });
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('lx-on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('lx-on'), 2200); }

  async function call(path, method, body) {
    const r = await fetch(path, { method: method || 'GET', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { /* risposta senza JSON */ }
    if (r.status === 401 && path !== '/api/session') { showLogin(); throw new Error('Sessione scaduta, rientra.'); }
    if (!r.ok) throw new Error((j && j.error) || 'Errore ' + r.status);
    return j;
  }

  // ---------- descrizione di un evento ----------
  function descr(e) {
    if (e.grammi) return 'Peso: ' + kg(e.grammi);
    if (e.evento === 'Pannolino') {
      const p = [];
      if (e.pipi > 0) p.push(e.pipi > 1 ? `pipì ×${e.pipi}` : 'pipì');
      if (e.cacca > 0) p.push(e.cacca > 1 ? `cacca ×${e.cacca}` : 'cacca');
      return 'Pannolino: ' + (p.length ? p.join(' e ') : 'vuoto');
    }
    if (e.evento === 'Poppata') {
      if (e.latte === 'Coccola') return 'Coccola al seno' + (e.fine ? `, fino alle ${e.fine}` : '');
      return 'Poppata: ' + [e.latte.toLowerCase(), e.ml > 0 ? `${int(e.ml)} ml` : '', e.fine ? `fino alle ${e.fine}` : ''].filter(Boolean).join(', ');
    }
    return e.evento;
  }
  const breve = e => e.evento === 'Poppata' ? [e.latte.toLowerCase(), e.ml > 0 ? `${int(e.ml)} ml` : ''].filter(Boolean).join(', ') : descr(e).replace('Pannolino: ', '');

  // ---------- scheda Registra ----------
  function renderRegistra() {
    const D = state.data, now = adesso();
    const log = D ? D.log : [];
    const lastOf = f => { for (let i = log.length - 1; i >= 0; i--) if (f(log[i])) return log[i]; return null; };
    const lp = lastOf(r => r.evento === 'Poppata' && r.latte !== 'Coccola'), ln = lastOf(r => r.evento === 'Pannolino');
    $('last-poppata').textContent = lp ? `${fa(now.ts - lp.ts)} · ${lp.ora}, ${breve(lp)}` : 'nessuna registrata';
    $('last-pannolino').textContent = ln ? `${fa(now.ts - ln.ts)} · ${ln.ora}, ${breve(ln)}` : 'nessuno registrato';

    const u = D && D.ultimo && D.ultimo.data === now.data ? D.ultimo : { poppate: 0, ml_totali: 0, pipi: 0, cacca: 0 };
    bind('u-data', dayLong(now.data)); bind('u-poppate', int(u.poppate)); bind('u-ml', int(u.ml_totali)); bind('u-pipi', int(u.pipi)); bind('u-cacca', int(u.cacca));
    const pe = state.pesi[state.pesi.length - 1];
    $('last-peso').textContent = pe ? `${kg(pe.grammi)} · ${pe.data === now.data ? 'oggi' : dayShort(pe.data)}` : 'da registrare';
    renderObiettivi(u, pe, now);

    const list = $('list'); list.replaceChildren();
    const all = log.concat(state.pesi).sort((a, b) => a.ts - b.ts);
    if (!all.length) { const p = document.createElement('p'); p.className = 'lx-fail'; p.textContent = 'Ancora nessuna registrazione.'; list.append(p); $('more').hidden = true; return; }
    // si mostrano giorni interi: i primi state.shown giorni, i più recenti
    const days = Array.from(new Set(all.map(e => e.data))).sort().reverse(), keep = new Set(days.slice(0, state.shown));
    const rows = all.slice().reverse().filter(e => keep.has(e.data));
    // Oggi resta aperto; ogni giorno precedente è chiuso in una tendina (che resta aperta se l'hai aperta, anche al ricaricamento dei dati)
    const perDay = new Map(); all.forEach(e => perDay.set(e.data, (perDay.get(e.data) || 0) + 1));
    let day = null, box = list;
    rows.forEach(e => {
      if (e.data !== day) {
        day = e.data;
        if (day === now.data) { const h = document.createElement('p'); h.className = 'lx-day'; h.textContent = 'oggi'; list.append(h); box = list; }
        else {
          const d = document.createElement('details'), s = document.createElement('summary'), k = day, n = perDay.get(k);
          d.className = 'lx-dayacc'; d.open = state.openDays.has(k);
          const dl = dayLong(k); s.textContent = dl.charAt(0).toUpperCase() + dl.slice(1); const c = document.createElement('span'); c.className = 'lx-dayacc-n'; c.textContent = n === 1 ? '1 registrazione' : `${n} registrazioni`; s.append(c);
          d.addEventListener('toggle', () => { if (d.open) state.openDays.add(k); else state.openDays.delete(k); });
          d.append(s); list.append(d); box = d;
        }
      }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-ev';
      const h = document.createElement('span'); h.className = 'lx-ev-h'; h.textContent = e.ora;
      const t = document.createElement('span'); t.className = 'lx-ev-t'; t.textContent = descr(e);
      b.append(h, t);
      if (e.nota) { const n = document.createElement('span'); n.className = 'lx-ev-n'; n.textContent = e.nota; b.append(n); }
      b.addEventListener('click', () => openForm(e.grammi ? 'Peso' : e.evento, e));
      box.append(b);
    });
    $('more').hidden = days.length <= state.shown;
  }

  // Barre di avanzamento: latte (dal peso più recente) e pipì (almeno 6 al giorno)
  function bar(id, val, max, mark) {
    const el = $(id), f = el.querySelector('.lx-bar-f'), m = el.querySelector('.lx-bar-m');
    f.style.width = Math.min(100, max > 0 ? val / max * 100 : 0) + '%';
    if (m) { m.hidden = mark == null; if (mark != null) m.style.left = Math.min(100, mark / max * 100) + '%'; }
    el.setAttribute('aria-valuemax', String(max)); el.setAttribute('aria-valuenow', String(Math.min(val, max)));
  }
  function renderObiettivi(u, pe, now) {
    const ob = (pe && Calcs.obiettivi(pe.grammi)) || { pipi_min: Calcs.PIPI_MIN };
    const ml = +u.ml_totali, pipi = +u.pipi;
    const L = $('ob-latte');
    L.classList.toggle('lx-off', !pe);
    if (pe) {
      const giorni = Math.round((Date.parse(now.data) - Date.parse(pe.data)) / 86400000);
      $('ob-base').textContent = `In base all'ultimo peso, ${kg(pe.grammi)} ` + (giorni <= 0 ? 'di oggi.' : giorni === 1 ? 'di ieri.' : `di ${giorni} giorni fa` + (giorni > 7 ? ': conviene ripesarlo.' : '.'));
      $('ob-latte-v').textContent = `${int(ml)} / ${int(ob.ml_min)}-${int(ob.ml_max)} ml`;
      $('ob-latte').style.setProperty('--bar', 'var(--sky)');
      bar('ob-latte-bar', ml, ob.ml_max, ob.ml_min);
      L.classList.toggle('lx-ok', ml >= ob.ml_min);
      const stato = ml >= ob.ml_min ? (ml > ob.ml_max ? 'Sopra la fascia indicata.' : 'Obiettivo raggiunto.') : `Mancano almeno ${int(ob.ml_min - ml)} ml.`;
      $('ob-latte-n').textContent = `${stato} A poppata ${int(ob.poppata_min)}-${int(ob.poppata_max)} ml, su 8 poppate. Contano solo i ml dei biberon.` + (ob.fuori_tabella ? ' Peso fuori tabella: stima a 150-200 ml per kg.' : '');
    } else {
      $('ob-base').textContent = "Registra il peso per avere l'obiettivo di latte.";
      $('ob-latte-v').textContent = `${int(ml)} ml`;
      bar('ob-latte-bar', 0, 1, null);
      L.classList.remove('lx-ok');
      $('ob-latte-n').textContent = 'Serve il peso: tocca Peso qui sopra.';
    }
    const P = $('ob-pipi'), min = ob.pipi_min;
    P.style.setProperty('--bar', 'var(--c3)');
    $('ob-pipi-v').textContent = `${int(pipi)} / ${int(min)}`;
    bar('ob-pipi-bar', pipi, min, null);
    P.classList.toggle('lx-ok', pipi >= min);
    $('ob-pipi-n').textContent = pipi >= min ? 'Obiettivo raggiunto.' : `Ne ${min - pipi === 1 ? 'manca 1' : `mancano ${int(min - pipi)}`} per arrivare ad almeno ${int(min)} al giorno.`;
  }

  // ---------- scheda Dashboard ----------
  const GIORNI = 14;
  function renderDash() {
    const D = state.data;
    $('dash').hidden = !D;
    if (!D) { $('take').textContent = 'Ancora nessun dato: registra il primo evento.'; return; }
    if ($('p-dashboard').hidden) return;
    const m = D.medie;
    $('take').textContent = m.giorni
      ? `Negli ultimi ${m.giorni} giorni completi: in media ${dec(m.poppate)} poppate, ${dec(m.pipi)} pipì e ${dec(m.cacca)} cacche al giorno.`
      : 'Le medie arrivano dopo il primo giorno completo di registrazioni.';
    bind('m-giorni', int(m.giorni)); bind('m-poppate', dec(m.poppate)); bind('m-ml', int(m.ml)); bind('m-giorni-ml', int(m.giorni_ml)); bind('m-pipi', dec(m.pipi)); bind('m-cacca', dec(m.cacca));
    const g = D.giornaliero.slice(-GIORNI), days = new Set(g.map(r => r.data));
    const o = D.orario.filter(r => days.has(r.data));
    ['heat', 'prof'].forEach(id => { $(id).closest('.lx-card').dataset.c = MET[state.metric].k; });
    heat($('heat'), o);
    const M = MET[state.metric];
    barChart($('prof'), { rows: Calcs.fascia(o), key: 'ora', stacked: true, totals: false, pad: .2, h: 200, label: `Totale di ${M.label} per ora del giorno`,
      series: [{ key: state.metric, name: M.label, c: M.c }], xLab: (k, i) => i % 3 === 0 ? String(k).padStart(2, '0') : '', tipTitle: k => `${String(k).padStart(2, '0')}:00 - ${String(k).padStart(2, '0')}:59` });
    const every = g.length > 8 ? 2 : 1;
    const base = { rows: g, key: 'data', xLab: (k, i) => (g.length - 1 - i) % every === 0 ? dayNum(k) : '', tipTitle: dayLong, pad: g.length > 8 ? .2 : .3 };
    barChart($('ch_poppate'), Object.assign({}, base, { stacked: true, totals: true, label: 'Poppate al giorno', series: [{ key: 'poppate_seno', name: 'Materno', c: 0 }, { key: 'poppate_formula', name: 'Artificiale', c: 1 }, { key: 'poppate_miste', name: 'Misto', c: 2 }] }));
    barChart($('ch_ml'), Object.assign({}, base, { stacked: true, totals: g.length <= 8, unit: ' ml', label: 'Millilitri al giorno', series: [{ key: 'ml_formula', name: 'Artificiale', c: 1 }, { key: 'ml_seno', name: 'Materno in biberon', c: 0 }] }));
    barChart($('ch_pann'), Object.assign({}, base, { stacked: false, totals: g.length <= 8, label: 'Pipì e cacca al giorno', series: [{ key: 'pipi', name: 'Pipì', c: 3 }, { key: 'cacca', name: 'Cacca', c: 4 }] }));
    renderPeso();
    document.querySelectorAll('.lx-sw[data-c]').forEach(s => { s.style.background = C(+s.dataset.c); });
  }
  function renderPeso() {
    const tr = Calcs.trendPeso(state.pesi, 14), P = state.pesi;
    const sgn = v => (v >= 0 ? '+' : '−') + int(Math.abs(v));
    $('peso-trend').textContent = tr
      ? `Tendenza: ${sgn(tr.g_giorno)} g al giorno, circa ${sgn(tr.g_giorno * 7)} g a settimana (${tr.n} pesate dal ${dayLong(tr.da.data)}).` + (P.length > 1 ? ` Dalla prima pesata: ${sgn(P[P.length - 1].grammi - P[0].grammi)} g.` : '')
      : P.length ? 'Per la tendenza servono almeno due pesate a un giorno di distanza.' : '';
    pesoChart($('ch_peso'), P, tr);
  }

  // ---------- scheda Trofei ----------
  const ICONA = { poppate: '🍼', latte: '🥛', notte: '🌙', pannolini: '🧷', peso: '⚖️', diario: '📒' };
  function avanz(T) {
    const f = { ml: v => n1.format(v / 1000) + ' L', ml1: v => int(v) + ' ml', g: v => kg(v), min: v => `${Math.floor(v / 60)} h ${pad(v % 60)}`, '%': v => int(v) + '%' }[T.u] || int;
    return `${f(T.v)} / ${f(T.n)}`;
  }
  function renderTrofei() {
    const L = state.trofei, ok = L.filter(t => t.ok);
    $('tro-n').textContent = `${ok.length} trofei su ${L.length}`;
    const ult = ok.slice().sort((a, b) => b.ordine - a.ordine)[0];
    $('tro-ultimo').textContent = ult ? `L'ultimo: ${ult.nome}, ${dayLong(ult.data)}.` : 'Si sbloccano da soli, registrando.';
    $('tro-n').closest('.lx-tro-sum').style.setProperty('--bar', 'var(--c3)');
    bar('tro-bar', ok.length, L.length || 1, null);
    const box = $('tro-list'); box.replaceChildren();
    Calcs.CATEGORIE.forEach(c => {
      const T = L.filter(t => t.cat === c.id); if (!T.length) return;
      const sec = document.createElement('div'); sec.className = 'lx-sec';
      const h = document.createElement('h2'); h.textContent = `${c.nome} `; const n = document.createElement('span'); n.className = 'lx-tro-cnt'; n.textContent = `${T.filter(t => t.ok).length}/${T.length}`; h.append(n);
      sec.append(h);
      const grid = document.createElement('div'); grid.className = 'lx-tros';
      T.forEach(t => {
        const d = document.createElement('div'); d.className = 'lx-tro' + (t.ok ? ' lx-got' : ''); d.dataset.c = c.c;
        const i = document.createElement('span'); i.className = 'lx-tro-i'; i.setAttribute('aria-hidden', 'true'); i.textContent = t.ok ? ICONA[t.cat] : '🔒';
        const b = document.createElement('b'); b.textContent = t.nome;
        const p = document.createElement('span'); p.className = 'lx-tro-d'; p.textContent = t.desc;
        d.append(i, b, p);
        if (t.ok) { const s = document.createElement('span'); s.className = 'lx-tro-q'; s.textContent = 'Sbloccato ' + dayLong(t.data); d.append(s); }
        else {
          const q = document.createElement('span'); q.className = 'lx-tro-q'; q.textContent = avanz(t);
          const br = document.createElement('div'); br.className = 'lx-bar lx-bar-s'; br.setAttribute('aria-hidden', 'true');
          const f = document.createElement('i'); f.className = 'lx-bar-f'; f.style.width = Math.min(100, t.v / t.n * 100) + '%'; br.append(f);
          d.append(br, q);
        }
        d.setAttribute('aria-label', `${t.nome}. ${t.desc} ${t.ok ? 'Sbloccato ' + dayLong(t.data) : 'Ancora da sbloccare: ' + avanz(t)}.`);
        grid.append(d);
      });
      box.append(sec, grid);
    });
  }

  // Popup del trofeo: dopo un salvataggio, mostra uno per uno i trofei che prima non c'erano
  const coda = [];
  function festeggia(prima) {
    state.trofei.filter(t => t.ok && !prima.has(t.id)).forEach(t => coda.push(t));
    if (coda.length && $('win').hidden) prossimo();
  }
  function prossimo() {
    const t = coda.shift(), w = $('win');
    if (!t) { w.hidden = true; return; }
    const c = Calcs.CATEGORIE.find(x => x.id === t.cat);
    w.dataset.c = c ? c.c : 'pop';
    $('win-t').textContent = t.nome; $('win-d').textContent = t.desc;
    w.hidden = false; w.classList.remove('lx-pop'); void w.offsetWidth; w.classList.add('lx-pop');
    $('win-ok').textContent = coda.length ? `Evviva! (${coda.length} ${coda.length === 1 ? 'altro' : 'altri'})` : 'Evviva!';
    $('win-ok').focus();
  }
  $('win-ok').addEventListener('click', prossimo);
  $('win').addEventListener('click', e => { if (e.target === $('win')) prossimo(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('win').hidden) prossimo(); });
  const sbloccati = () => new Set(state.trofei.filter(t => t.ok).map(t => t.id));

  function render() { state.trofei = Calcs.trofei(state.data ? state.data.log : [], state.pesi); renderRegistra(); renderDash(); renderTrofei(); }

  // ---------- dati ----------
  async function load() {
    let evs, pesi;
    try { [evs, pesi] = await Promise.all([call('/api/events'), call('/api/pesi').catch(e => { console.warn('Pesate non caricate:', e.message); return null; })]); }
    catch (e) { $('foot').textContent = 'Dati non aggiornati: ' + e.message; return; }
    if (pesi) state.pesi = pesi.map(p => Object.assign({}, p, { ts: Calcs.fromEvents([{ data: p.data, ora: p.ora }])[0].ts })).sort((a, b) => a.ts - b.ts);
    const log = Calcs.fromEvents(evs);
    state.data = log.length ? Calcs.allFromLog(log, adesso().data) : null;
    $('foot').textContent = 'Aggiornato alle ' + new Date().toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' }) + '. Si aggiorna da solo ogni minuto.';
    render();
  }

  // ---------- modulo di registrazione ----------
  const dlg = $('dlg'), form = $('f');
  const radio = (name, v) => { if (v === undefined) { const c = form.querySelector(`input[name="${name}"]:checked`); return c ? c.value : ''; } form.querySelectorAll(`input[name="${name}"]`).forEach(i => { i.checked = i.value === String(v); }); };
  const mlVisible = () => { $('ml-box').hidden = radio('latte') === 'Coccola'; };

  function mlChips() {
    const freq = new Map();
    (state.data ? state.data.log : []).forEach(r => { if (r.ml > 0) freq.set(r.ml, (freq.get(r.ml) || 0) + 1); });
    let vals = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    if (vals.length < 3) vals = [30, 60, 90];
    vals = Array.from(new Set(vals.concat([100, 120]))); // 100 e 120 sempre a portata di dito
    const box = $('ml-chips'); box.replaceChildren();
    vals.sort((a, b) => a - b).forEach(v => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-chip'; b.textContent = int(v);
      b.setAttribute('aria-label', `${v} millilitri`);
      b.addEventListener('click', () => { $('f-ml').value = v; });
      box.append(b);
    });
  }

  function openForm(kind, ev) {
    const group = kind === 'Poppata' || kind === 'Pannolino' || kind === 'Peso' ? kind : 'Altro';
    state.editing = ev || null; state.group = group;
    form.querySelectorAll('[data-ev]').forEach(d => { d.hidden = d.dataset.ev !== group; });
    dlg.dataset.c = { Poppata: 'pop', Pannolino: 'pann', Peso: 'peso', Altro: 'altro' }[group];
    $('dlg-t').textContent = (ev ? 'Modifica: ' : '') + { Poppata: 'Poppata', Pannolino: 'Pannolino', Peso: 'Peso', Altro: 'Altro evento' }[group];
    const now = adesso();
    $('f-data').value = ev ? ev.data : now.data; $('f-ora').value = ev ? ev.ora : now.ora;
    $('f-nota').value = ev ? ev.nota : '';
    radio('pipi', ev ? Math.min(1, ev.pipi) : 0); radio('cacca', ev ? Math.min(1, ev.cacca) : 0);
    const log = state.data ? state.data.log : [];
    const lastP = log.filter(r => r.evento === 'Poppata' && r.latte !== 'Coccola').pop();
    radio('latte', ev && ev.latte ? ev.latte : (lastP ? lastP.latte : 'Materno'));
    $('f-ml').value = ev && ev.ml > 0 ? ev.ml : '';
    radio('tipo', ev && group === 'Altro' ? ev.evento : 'Altro');
    const lastPe = state.pesi[state.pesi.length - 1];
    $('f-grammi').value = ev && ev.grammi ? ev.grammi : ''; $('f-grammi').placeholder = lastPe ? `ultimo: ${lastPe.grammi}` : 'es. 3450'; grammiKg();
    mlChips(); mlVisible();
    $('f-err').hidden = true; $('f-del').hidden = !ev; $('f-save').disabled = false;
    // Il fuoco va sul titolo, non sul primo campo: su iOS il fuoco sulla data aprirebbe subito il selettore.
    // Data, ora e gli altri campi si aprono solo quando li tocchi.
    dlg.showModal();
    $('dlg-t').focus({ preventScroll: true });
  }

  function grammiKg() { const v = Number($('f-grammi').value); $('f-grammi-kg').textContent = v >= 500 ? `= ${kg(v)}` : 'Ad esempio 3450 per 3,45 kg.'; }
  $('f-grammi').addEventListener('input', grammiKg);
  form.addEventListener('change', mlVisible);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const g = state.group, ed = state.editing;
    const b = { data: $('f-data').value, ora: $('f-ora').value, evento: g === 'Altro' ? radio('tipo') : g, nota: $('f-nota').value };
    const api = g === 'Peso' ? '/api/pesi' : '/api/events';
    if (g === 'Peso') { delete b.evento; b.grammi = $('f-grammi').value === '' ? 0 : Number($('f-grammi').value); }
    if (g === 'Pannolino') {
      // un conteggio oltre 1 (registrato prima, o arrivato da un import) resta com'è se resta su "Sì"
      const keep = (k) => ed && ed[k] > 1 && radio(k) === '1' ? ed[k] : Number(radio(k));
      b.pipi = keep('pipi'); b.cacca = keep('cacca');
    }
    if (g === 'Poppata') { b.latte = radio('latte'); b.ml = $('f-ml').value === '' ? 0 : Number($('f-ml').value); b.fine = ed && ed.fine ? ed.fine : ''; } // il campo non è più nel modulo: un'ora di fine già salvata resta
    const err = $('f-err'); err.hidden = true; $('f-save').disabled = true;
    try {
      await call(ed ? api + '?id=' + encodeURIComponent(ed.id) : api, ed ? 'PUT' : 'POST', b);
      const prima = sbloccati();
      dlg.close(); toast(ed ? 'Modificato' : 'Registrato'); await load(); festeggia(prima);
    } catch (x) { err.textContent = x.message; err.hidden = false; $('f-save').disabled = false; }
  });
  $('f-cancel').addEventListener('click', () => dlg.close());
  // Maniglia del foglio: trascinata in giù oltre una soglia (o con un colpo veloce) chiude, toccata chiude, altrimenti torna su.
  (function grab() {
    const h = $('dlg-grab'); let y0 = null, t0 = 0, dy = 0;
    const set = v => { dlg.style.transform = v ? `translateY(${v}px)` : ''; };
    h.addEventListener('pointerdown', e => { y0 = e.clientY; t0 = e.timeStamp; dy = 0; h.setPointerCapture(e.pointerId); dlg.classList.remove('lx-anim'); dlg.classList.add('lx-drag'); });
    h.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); set(dy); });
    const end = e => {
      if (y0 == null) return;
      const fast = dy > 30 && dy / Math.max(1, e.timeStamp - t0) > .5;
      y0 = null; dlg.classList.remove('lx-drag'); dlg.classList.add('lx-anim');
      if (e.type === 'pointercancel' || (dy > 4 && dy < 100 && !fast)) { set(0); return; }
      set(dlg.offsetHeight);
      setTimeout(() => dlg.close(), matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 200);
    };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dlg.close(); } });
    dlg.addEventListener('close', () => { dlg.classList.remove('lx-anim', 'lx-drag'); set(0); });
  })();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('f-del').addEventListener('click', async () => {
    const ed = state.editing; if (!ed || !confirm(`Eliminare "${descr(ed)}" delle ${ed.ora}?`)) return;
    try { await call((ed.grammi ? '/api/pesi' : '/api/events') + '?id=' + encodeURIComponent(ed.id), 'DELETE'); dlg.close(); toast('Eliminato'); await load(); }
    catch (x) { const err = $('f-err'); err.textContent = x.message; err.hidden = false; }
  });
  document.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.new)));
  $('more').addEventListener('click', () => { state.shown += 14; renderRegistra(); });

  // ---------- schede ----------
  function showTab(name) {
    state.tab = name;
    document.querySelectorAll('.lx-tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('lx-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    ['registra', 'dashboard', 'trofei'].forEach(k => { $('p-' + k).hidden = name !== k; });
    try { localStorage.setItem('diario-tab', name); } catch (e) { /* senza memoria locale va bene lo stesso */ }
    renderDash();
  }
  document.querySelectorAll('.lx-tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  document.querySelectorAll('.lx-chip[data-m]').forEach(b => b.addEventListener('click', () => {
    state.metric = b.dataset.m;
    document.querySelectorAll('.lx-chip[data-m]').forEach(x => { const on = x === b; x.classList.toggle('lx-on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    renderDash();
  }));
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(renderDash, 150); });

  // ---------- import, logout ----------
  $('imp-go').addEventListener('click', async () => {
    const f = $('imp-file').files[0], msg = $('imp-msg'), rep = $('imp-replace').checked;
    if (!f) { msg.textContent = 'Scegli prima un file.'; return; }
    if (rep && !confirm('Cancello TUTTI i dati attuali, comprese le registrazioni fatte dal sito, e li sostituisco con il file. Procedo?')) return;
    msg.textContent = 'Importazione in corso…';
    try {
      const r = await call('/api/import', 'POST', { csv: await f.text(), modo: rep ? 'sostituisci' : 'aggiungi' });
      msg.textContent = `Fatto: ${r.importati} eventi nel file, ${r.nuovi} aggiunti, ${r.totale} in archivio.`;
      $('imp-file').value = ''; $('imp-replace').checked = false; await load();
    } catch (x) { msg.textContent = x.message; }
  });
  $('logout').addEventListener('click', async () => { try { await call('/api/session', 'DELETE'); } finally { showLogin(); } });

  // ---------- accesso ----------
  let timer;
  function showLogin() { clearInterval(timer); if (dlg.open) dlg.close(); $('app').hidden = true; $('login').hidden = false; $('pw').value = ''; $('pw').focus(); }
  function showApp() {
    $('login').hidden = true; $('app').hidden = false;
    let tab = 'registra'; try { tab = localStorage.getItem('diario-tab') || tab; } catch (e) { /* idem */ }
    showTab(['dashboard', 'trofei'].includes(tab) ? tab : 'registra');
    load(); clearInterval(timer); timer = setInterval(load, 60000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) load(); });
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('login-err'); err.hidden = true;
    try { await call('/api/session', 'POST', { password: $('pw').value }); showApp(); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  });
  call('/api/session').then(s => (s && s.ok ? showApp() : showLogin())).catch(showLogin);
})();
