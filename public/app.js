(function () {
  const COLORS = [0, 1, 2, 3, 4].map(i => `var(--c${i})`);
  const C = i => COLORS[i % COLORS.length];
  const fmtD = (opts, s) => new Intl.DateTimeFormat('it', Object.assign({ timeZone: 'UTC' }, opts)).format(new Date(s + 'T00:00:00Z'));
  const dayShort = s => fmtD({ weekday: 'short', day: 'numeric' }, s);
  const dayNum = s => fmtD({ day: 'numeric' }, s);
  const dayLong = s => fmtD({ weekday: 'long', day: 'numeric', month: 'long' }, s);
  const n0 = new Intl.NumberFormat('it', { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat('it', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const int = v => n0.format(+v), dec = v => n1.format(+v);
  const MET = { poppate: { label: 'poppate', c: 0 }, ml: { label: 'ml', c: 1 }, pipi: { label: 'pipì', c: 3 }, cacca: { label: 'cacca', c: 4 } };
  const state = { metric: 'poppate', data: null, shown: 30, tab: 'registra', editing: null, group: null };
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

    const list = $('list'); list.replaceChildren();
    if (!log.length) { const p = document.createElement('p'); p.className = 'lx-fail'; p.textContent = 'Ancora nessuna registrazione.'; list.append(p); $('more').hidden = true; return; }
    const rows = log.slice().reverse().slice(0, state.shown);
    let day = null;
    rows.forEach(e => {
      if (e.data !== day) { day = e.data; const h = document.createElement('p'); h.className = 'lx-day'; h.textContent = e.data === now.data ? 'oggi' : dayLong(e.data); list.append(h); }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-ev';
      const h = document.createElement('span'); h.className = 'lx-ev-h'; h.textContent = e.ora;
      const t = document.createElement('span'); t.className = 'lx-ev-t'; t.textContent = descr(e);
      b.append(h, t);
      if (e.nota) { const n = document.createElement('span'); n.className = 'lx-ev-n'; n.textContent = e.nota; b.append(n); }
      b.addEventListener('click', () => openForm(e.evento, e));
      list.append(b);
    });
    $('more').hidden = log.length <= state.shown;
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
    heat($('heat'), o);
    const M = MET[state.metric];
    barChart($('prof'), { rows: Calcs.fascia(o), key: 'ora', stacked: true, totals: false, pad: .2, h: 200, label: `Totale di ${M.label} per ora del giorno`,
      series: [{ key: state.metric, name: M.label, c: M.c }], xLab: (k, i) => i % 3 === 0 ? String(k).padStart(2, '0') : '', tipTitle: k => `${String(k).padStart(2, '0')}:00 - ${String(k).padStart(2, '0')}:59` });
    const every = g.length > 8 ? 2 : 1;
    const base = { rows: g, key: 'data', xLab: (k, i) => (g.length - 1 - i) % every === 0 ? dayNum(k) : '', tipTitle: dayLong, pad: g.length > 8 ? .2 : .3 };
    barChart($('ch_poppate'), Object.assign({}, base, { stacked: true, totals: true, label: 'Poppate al giorno', series: [{ key: 'poppate_seno', name: 'Materno', c: 0 }, { key: 'poppate_formula', name: 'Artificiale', c: 1 }, { key: 'poppate_miste', name: 'Misto', c: 2 }] }));
    barChart($('ch_ml'), Object.assign({}, base, { stacked: true, totals: g.length <= 8, unit: ' ml', label: 'Millilitri al giorno', series: [{ key: 'ml_formula', name: 'Artificiale', c: 1 }, { key: 'ml_seno', name: 'Materno in biberon', c: 0 }] }));
    barChart($('ch_pann'), Object.assign({}, base, { stacked: false, totals: g.length <= 8, label: 'Pipì e cacca al giorno', series: [{ key: 'pipi', name: 'Pipì', c: 3 }, { key: 'cacca', name: 'Cacca', c: 4 }] }));
    document.querySelectorAll('.lx-sw[data-c]').forEach(s => { s.style.background = C(+s.dataset.c); });
  }

  function render() { renderRegistra(); renderDash(); }

  // ---------- dati ----------
  async function load() {
    let evs;
    try { evs = await call('/api/events'); }
    catch (e) { $('foot').textContent = 'Dati non aggiornati: ' + e.message; return; }
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
    if (vals.length < 3) vals = [30, 60, 90, 120];
    const box = $('ml-chips'); box.replaceChildren();
    vals.sort((a, b) => a - b).forEach(v => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-chip'; b.textContent = int(v);
      b.setAttribute('aria-label', `${v} millilitri`);
      b.addEventListener('click', () => { $('f-ml').value = v; });
      box.append(b);
    });
  }

  function openForm(kind, ev) {
    const group = kind === 'Poppata' || kind === 'Pannolino' ? kind : 'Altro';
    state.editing = ev || null; state.group = group;
    form.querySelectorAll('[data-ev]').forEach(d => { d.hidden = d.dataset.ev !== group; });
    $('dlg-t').textContent = (ev ? 'Modifica: ' : '') + { Poppata: 'Poppata', Pannolino: 'Pannolino', Altro: 'Altro evento' }[group];
    const now = adesso();
    $('f-data').value = ev ? ev.data : now.data; $('f-ora').value = ev ? ev.ora : now.ora;
    $('f-nota').value = ev ? ev.nota : '';
    radio('pipi', ev ? Math.min(3, ev.pipi) : 0); radio('cacca', ev ? Math.min(3, ev.cacca) : 0);
    const log = state.data ? state.data.log : [];
    const lastP = log.filter(r => r.evento === 'Poppata' && r.latte !== 'Coccola').pop();
    radio('latte', ev && ev.latte ? ev.latte : (lastP ? lastP.latte : 'Materno'));
    $('f-ml').value = ev && ev.ml > 0 ? ev.ml : ''; $('f-fine').value = ev ? ev.fine : '';
    radio('tipo', ev && group === 'Altro' ? ev.evento : 'Altro');
    mlChips(); mlVisible();
    $('f-err').hidden = true; $('f-del').hidden = !ev; $('f-save').disabled = false;
    dlg.showModal();
  }

  form.addEventListener('change', mlVisible);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const g = state.group, ed = state.editing;
    const b = { data: $('f-data').value, ora: $('f-ora').value, evento: g === 'Altro' ? radio('tipo') : g, nota: $('f-nota').value };
    if (g === 'Pannolino') {
      // un conteggio oltre 3 (arrivato da un import) resta com'è se non viene toccato
      const keep = (k) => ed && ed[k] > 3 && radio(k) === '3' ? ed[k] : Number(radio(k));
      b.pipi = keep('pipi'); b.cacca = keep('cacca');
    }
    if (g === 'Poppata') { b.latte = radio('latte'); b.ml = $('f-ml').value === '' ? 0 : Number($('f-ml').value); b.fine = $('f-fine').value; }
    const err = $('f-err'); err.hidden = true; $('f-save').disabled = true;
    try {
      await call(ed ? '/api/events?id=' + encodeURIComponent(ed.id) : '/api/events', ed ? 'PUT' : 'POST', b);
      dlg.close(); toast(ed ? 'Modificato' : 'Registrato'); await load();
    } catch (x) { err.textContent = x.message; err.hidden = false; $('f-save').disabled = false; }
  });
  $('f-cancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('f-del').addEventListener('click', async () => {
    const ed = state.editing; if (!ed || !confirm(`Eliminare "${descr(ed)}" delle ${ed.ora}?`)) return;
    try { await call('/api/events?id=' + encodeURIComponent(ed.id), 'DELETE'); dlg.close(); toast('Eliminato'); await load(); }
    catch (x) { const err = $('f-err'); err.textContent = x.message; err.hidden = false; }
  });
  document.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.new)));
  $('more').addEventListener('click', () => { state.shown += 30; renderRegistra(); });

  // ---------- schede ----------
  function showTab(name) {
    state.tab = name;
    document.querySelectorAll('.lx-tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('lx-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('p-registra').hidden = name !== 'registra'; $('p-dashboard').hidden = name !== 'dashboard';
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
    showTab(tab === 'dashboard' ? 'dashboard' : 'registra');
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
