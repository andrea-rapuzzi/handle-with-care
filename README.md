# Diario del piccolo

Mini sito per registrare poppate e pannolini dal telefono e vederli in una dashboard. Protetto da una password condivisa. Nessun build, nessuna dipendenza npm.

```
Telefono  ->  /api/events (Netlify)  ->  Google Sheet, scheda Log
                    |
              pagina: scheda Registra + scheda Dashboard (calcoli e grafici nel browser)
```

## File

- `public/`: tutto ciò che il browser scarica. `index.html`, `style.css`, `app.js` (interfaccia e grafici d3), `calcs.js` (calcoli), `vendor/d3.min.js`.
- `api/session.js`: login, logout, stato della sessione.
- `api/events.js`: elenco, creazione, modifica, eliminazione degli eventi. `?format=csv` per l'export.
- `api/import.js`: import di un CSV con le colonne del vecchio foglio.
- `netlify/functions/api.js`: l'unica funzione Netlify, instrada `/api/*` ai tre file di `api/`. `netlify.toml`: cartella pubblicata, instradamento, header.
- `lib/`: `auth.js` (password e cookie firmato), `sheets.js` (lettura e scrittura del Google Sheet), `store.js` (sceglie tra foglio e file JSON locale), `events.js` (validazione, CSV), `http.js`, `headers.js` (header di sicurezza).
- `data/log-iniziale.csv`: copia dei dati del foglio al 7 novembre, usata dai test. Non è servita dal sito.
- `dev-server.js`, `test/run.js`, `test/fake-google.js`: server locale, test, finto Google per i test.

## Provarlo in locale

```sh
npm run dev     # http://localhost:8000, password "Enrico", dati in .data/eventi.json
npm test
```

## Il foglio come database

Il sito legge e scrive la scheda **Log** del foglio. Le colonne A:H restano quelle di sempre (Data, Ora, Evento, Pipì, Cacca, Latte, ml, Note). Il sito usa in più la colonna **I** per un ID di riga, che gli serve per modificare ed eliminare.

- Si può continuare a scrivere a mano nel foglio: alla prima lettura il sito assegna un ID alle righe che non ce l'hanno.
- Le colonne da J in poi (formule) non vengono mai scritte. Le nuove righe finiscono nella prima riga libera, dove le formule ci sono già, quindi le schede Giorni e Orario continuano ad aggiornarsi.
- Eliminare dal sito cancella l'intera riga del foglio.
- Non usare la colonna I per altro e non cancellare gli ID.
- Un evento inserito in ritardo finisce in fondo al foglio, non in ordine. Il sito ordina per data e ora, quindi i suoi numeri restano giusti; la colonna K del foglio ("Nuova poppata") invece presume l'ordine cronologico.

## Metterlo online

### 1. Service account Google (una volta sola)

Il sito entra nel foglio con un account tecnico, senza rendere pubblico nulla.

1. Vai su https://console.cloud.google.com, crea un progetto (ad esempio "diario").
2. "API e servizi", "Libreria": cerca **Google Sheets API** e abilitala.
3. "API e servizi", "Credenziali", "Crea credenziali", **Account di servizio**. Dagli un nome, nessun ruolo.
4. Apri l'account appena creato, scheda "Chiavi", "Aggiungi chiave", "Crea nuova chiave", formato **JSON**. Si scarica un file.
5. Apri il Google Sheet, "Condividi", e aggiungi come **Editor** l'indirizzo dell'account di servizio (finisce con `iam.gserviceaccount.com`).

### 2. Netlify

1. Su https://app.netlify.com scegli "Add new project", "Import an existing project" e collega il repository GitHub. Non serve compilare nulla: cartella pubblicata e funzioni sono già in `netlify.toml`. Lascia vuoto il comando di build.
2. In Project configuration, Environment variables, aggiungi:
   - `DIARIO_PASSWORD`: la password del sito.
   - `GOOGLE_SHEET_ID`: l'ID del foglio, o il suo indirizzo intero.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: tutto il contenuto del file JSON del punto 1.4, incollato così com'è.
   - `SHEET_TAB` (facoltativa): nome della scheda, se non è "Log".
3. Rilancia il deploy (Deploys, "Trigger deploy") ed entra. Se qualcosa non è configurato, il sito lo dice in chiaro (foglio non condiviso, ID sbagliato, scheda mancante).

Il file JSON è una chiave: non va nel repository. Dopo averlo incollato su Netlify si può cancellare.

Netlify concede alle funzioni circa 4 KB in tutto per le variabili d'ambiente. Il JSON del service account ne occupa poco più di 2: ci sta, ma non aggiungere altre variabili lunghe.

Sul telefono: apri il sito, entra una volta, "Aggiungi a schermata Home". Il login dura un anno per dispositivo.

## Accesso

- Una sola password per tutti (`DIARIO_PASSWORD`). Dopo il login il browser tiene un cookie firmato, HttpOnly, valido un anno.
- Cambiare la password fa uscire tutti i dispositivi.
- Dopo 10 password sbagliate da uno stesso indirizzo, 15 minuti di blocco. Il conteggio è tenuto in memoria dalla funzione, quindi è un freno, non una cassaforte: una password non banale resta la difesa vera.
- La pagina vuota (senza dati) è pubblica; tutti i dati passano da `/api/*`, che risponde solo a chi è entrato.

## Formato del CSV (import ed export)

Colonne: `Data, Ora, Evento, Pipi, Cacca, Latte, ml, Note`.

- Data: `2026-11-08` oppure `08/11/2026`. Ora: `07:30`.
- Evento: `Poppata`, `Pannolino`, `Vomito`, `Pianto`, `Altro`. Altri nomi diventano `Altro` con il nome nella nota.
- Latte: `Materno`, `Artificiale` o `Coccola` (le coccole non contano come poppate).
- Una nota `fino alle 07:30` su una poppata diventa l'ora di fine.
- L'import salta le righe già presenti nel foglio (stesso contenuto), quindi ripeterlo non crea doppioni. "Sostituisci tutto" svuota le colonne A:I della scheda Log, comprese le registrazioni fatte dal sito.
