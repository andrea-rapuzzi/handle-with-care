// Forma di un evento, controlli sui dati in ingresso, import ed export CSV.
const crypto = require('crypto');
const Calcs = require('../public/calcs.js');

const EVENTI = ['Poppata', 'Pannolino', 'Vomito', 'Pianto', 'Altro'];
const LATTI = ['Materno', 'Artificiale', 'Coccola'];
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
const int = (v, max) => { const n = Number(v == null || v === '' ? 0 : v); return Number.isInteger(n) && n >= 0 && n <= max ? n : null; };

// Dati grezzi dal modulo -> evento pulito, oppure { error }.
function clean(b) {
  if (!b || typeof b !== 'object') return { error: 'Dati mancanti' };
  const data = String(b.data || ''), ora = String(b.ora || ''), evento = String(b.evento || '');
  if (!validDate(data)) return { error: 'Data non valida' };
  if (!ORA.test(ora)) return { error: 'Ora non valida' };
  if (!EVENTI.includes(evento)) return { error: 'Tipo di evento non valido' };
  const ev = { data, ora, evento, pipi: 0, cacca: 0, latte: '', ml: 0, fine: '', nota: String(b.nota || '').trim().slice(0, 300) };
  if (evento === 'Pannolino') {
    ev.pipi = int(b.pipi, 9); ev.cacca = int(b.cacca, 9);
    if (ev.pipi == null || ev.cacca == null) return { error: 'Pipì e cacca devono essere numeri da 0 a 9' };
  }
  if (evento === 'Poppata') {
    ev.latte = String(b.latte || '');
    if (!LATTI.includes(ev.latte)) return { error: 'Scegli il tipo di latte' };
    ev.ml = ev.latte === 'Coccola' ? 0 : int(b.ml, 500);
    if (ev.ml == null) return { error: 'I ml devono essere un numero intero da 0 a 500' };
    ev.fine = String(b.fine || '');
    if (ev.fine && !ORA.test(ev.fine)) return { error: 'Ora di fine non valida' };
  }
  return { ev };
}

const sortEv = evs => evs.sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora) || String(a.creato).localeCompare(String(b.creato)));

// Una riga del log già letta da Calcs.loadLog -> evento pulito (senza id), oppure null.
function fromLogRow(r) {
  let evento = r.evento, nota = String(r.nota || '').trim(), fine = '';
  if (!EVENTI.includes(evento)) { nota = (evento + (nota ? ': ' + nota : '')); evento = 'Altro'; }
  const m = nota.match(/fino alle (\d{1,2})[:.](\d{2})/);
  if (m && evento === 'Poppata') {
    fine = m[1].padStart(2, '0') + ':' + m[2];
    if (ORA.test(fine)) nota = nota.replace(m[0], '').replace(/^[\s,;.]+|[\s,;]+$/g, ''); else fine = '';
  }
  const c = clean({ data: r.data, ora: r.ora, evento, pipi: r.pipi, cacca: r.cacca, latte: evento === 'Poppata' ? (LATTI.includes(r.latte) ? r.latte : 'Materno') : '', ml: Math.round(r.ml), fine, nota });
  return c.error ? null : c.ev;
}

// Impronta del contenuto: serve a riconoscere una riga già presente quando si importa un file.
const key = ev => [ev.data, ev.ora, ev.evento, ev.pipi, ev.cacca, ev.latte, ev.ml, ev.fine, ev.nota].join('|');

// CSV (colonne: Data, Ora, Evento, Pipi, Cacca, Latte, ml, Note) -> eventi.
function fromCSV(text) {
  const now = new Date().toISOString(), seen = new Map();
  return Calcs.loadLog(Calcs.parseCSV(text)).map(fromLogRow).filter(Boolean).map(ev => {
    const k = key(ev), n = (seen.get(k) || 0) + 1; seen.set(k, n); // due righe identiche nello stesso file restano due eventi
    ev.id = 'imp-' + crypto.createHash('sha1').update(k + '|' + n).digest('hex').slice(0, 16);
    ev.creato = now;
    return ev;
  });
}

// Evento -> le 8 colonne del foglio. L'ora di fine torna nella nota come "fino alle HH:MM".
function toRow(e) {
  const nota = [e.fine ? 'fino alle ' + e.fine : '', e.nota || ''].filter(Boolean).join(', ');
  return [e.data, e.ora, e.evento, e.evento === 'Pannolino' ? e.pipi : '', e.evento === 'Pannolino' ? e.cacca : '', e.latte || '', e.ml > 0 ? e.ml : '', nota];
}
const cell = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCSV(evs) {
  const rows = [['Data', 'Ora', 'Evento', 'Pipi', 'Cacca', 'Latte', 'ml', 'Note']].concat(sortEv(evs.slice()).map(toRow));
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}

module.exports = { EVENTI, LATTI, clean, sortEv, fromLogRow, key, fromCSV, toRow, toCSV };
