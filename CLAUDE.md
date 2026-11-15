# Diario del piccolo

Sito statico (`public/`) + tre handler (`api/`), online su Netlify. Lingua dell'interfaccia: italiano. Niente em dash nei testi.

- Dati: scheda `Log` di un Google Sheet, letta e scritta via API Sheets con un service account (`lib/sheets.js`, env `GOOGLE_SERVICE_ACCOUNT_JSON` e `GOOGLE_SHEET_ID`). Colonne A:H del foglio originale, colonna I = ID di riga. Mai scrivere da J in poi: ci sono formule. In locale, senza credenziali, file `.data/eventi.json`.
- Nuove righe con `values.append` + `insertDataOption=OVERWRITE` (atomico, riusa le righe che hanno già le formule). Letture con `UNFORMATTED_VALUE` + `SERIAL_NUMBER`: date e ore arrivano come numeri seriali.
- L'ora di fine poppata vive nella nota del foglio come `fino alle HH:MM` ed è separata in `fine` alla lettura.
- Accesso: password condivisa in `DIARIO_PASSWORD`, cookie firmato HMAC (`lib/auth.js`). Ogni endpoint dati chiama `requireAuth`.
- Evento: `{ id, data: 'YYYY-MM-DD', ora: 'HH:MM', evento, pipi, cacca, latte, ml, fine, nota }`. Data e ora sono quelle dell'orologio di casa, senza fuso. Validazione in `lib/events.js`.
- Tutta la logica di calcolo è in `public/calcs.js`, usata dal browser e da Node (import CSV, test).
- Regola poppate: una poppata che inizia entro 60 minuti dall'inizio della precedente si unisce (a catena). Le coccole sono escluse. Le medie usano gli ultimi 7 giorni completi con registrazioni, oggi escluso.
- Grafici in `public/app.js` con d3 v7 locale, ultimi 14 giorni. Colori da variabili CSS `--c0..--c4`.
- Gli handler hanno la forma `(req, res)` di Node e passano da `lib/http.js`, così girano identici in `dev-server.js`. Su Netlify li chiama un'unica funzione, `netlify/functions/diario.js`, che traduce l'evento e imposta `DIARIO_ONLINE` (niente archivio su file, cookie Secure). Un nuovo endpoint va aggiunto anche lì.
- Header di sicurezza in `lib/headers.js` (server locale e funzione) e ripetuti in `netlify.toml` (file statici): i test controllano che coincidano.
- Nessun build step, nessuna dipendenza. `npm test` prima di ogni deploy (usa `test/fake-google.js`, non tocca il foglio vero).
