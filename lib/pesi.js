// Forma di una pesata e controlli sui dati in ingresso.
// Pesata: { id, data: 'YYYY-MM-DD', ora: 'HH:MM', grammi, nota }. Data e ora dell'orologio di casa, senza fuso.
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN = 500, MAX = 20000;

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Dati grezzi dal modulo -> pesata pulita, oppure { error }.
function clean(b) {
  if (!b || typeof b !== 'object') return { error: 'Dati mancanti' };
  const data = String(b.data || ''), ora = String(b.ora || '');
  if (!validDate(data)) return { error: 'Data non valida' };
  if (!ORA.test(ora)) return { error: 'Ora non valida' };
  const grammi = Number(b.grammi);
  if (!Number.isInteger(grammi) || grammi < MIN || grammi > MAX) return { error: `Il peso va scritto in grammi, un numero intero da ${MIN} a ${MAX}` };
  return { p: { data, ora, grammi, nota: String(b.nota || '').trim().slice(0, 300) } };
}

const sortP = ps => ps.sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora) || String(a.creato).localeCompare(String(b.creato)));

module.exports = { clean, sortP, MIN, MAX };
