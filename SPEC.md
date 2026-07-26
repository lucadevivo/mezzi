# PROMPT PER CLAUDE CODE — App gestione mezzi condivisi in famiglia

> Copia tutto questo file nella prima sessione di Claude Code (o salvalo come `SPEC.md` nella root del repo e scrivi a Claude Code: *"Leggi SPEC.md e partiamo dalla Fase 0"*).

---

## 0. Come voglio che tu lavori

- **Prima di scrivere codice**: leggi tutta questa spec, poi fammi al massimo **8 domande** sui punti che ritieni ambigui o bloccanti. Non iniziare a implementare finché non ho risposto.
- Poi genera **`PLAN.md`** (fasi, task, criteri di accettazione) e **`CLAUDE.md`** (stack, comandi, convenzioni, struttura cartelle, come si lancia in dev e in prod). `CLAUDE.md` va tenuto aggiornato a ogni fase.
- **Lavora una fase alla volta.** Al termine di ogni fase: esegui i test, fai il build, fammi un riepilogo di cosa è pronto e di cosa hai deciso in autonomia, e **fermati aspettando la mia approvazione** prima di passare alla successiva.
- Commit piccoli e frequenti, in stile Conventional Commits (`feat:`, `fix:`, `chore:`…). Un commit per unità logica, non un mega-commit a fine fase.
- **Niente over-engineering**: gli utenti sono 3-5 persone di una famiglia, non 10.000. Nessun microservizio, nessuna coda esterna, nessun Kubernetes. Monolite pulito e leggibile.
- Le regole di calcolo (Sezione 4) sono la parte critica dell'app: vanno isolate in un modulo puro, senza dipendenze da DB o framework, e coperte da test unitari.
- Nessun segreto hardcoded: tutto in `.env`, con un `.env.example` versionato.
- Ogni scelta che non è specificata qui e che ha impatto strutturale: proponila e chiedimi conferma invece di deciderla in silenzio.

---

## 1. Contesto e infrastruttura

- L'app gira su un **server casalingo personale con Debian** già usato per altri servizi (un'altra web app, Immich).
- L'esposizione su internet avviene tramite **Cloudflare Tunnel** sul dominio **`webluca.app`**. Questa app dovrà stare su un sottodominio dedicato (es. `mezzi.webluca.app`).
- Deploy tramite **Docker + docker-compose**, con la app che ascolta solo su `127.0.0.1:<porta>` e il tunnel Cloudflare che fa da ingresso. Nessuna porta aperta sul router.
- Deve convivere con gli altri container: porta configurabile via `.env`, nomi container e volumi con prefisso dedicato, niente porte hardcoded.

---

## 2. Obiettivo dell'app

Io e i miei fratelli condividiamo **tre mezzi**:

| Mezzo | Tipo | Note |
|---|---|---|
| Ford Fiesta | auto | mezzo "di casa" |
| Fiat 500 | auto | è della nonna, ce la presta |
| Aprilia Scarabeo | scooter | |

Ognuno usa un po' tutti e tre. Il problema che l'app deve risolvere: **capire chi ha consumato quanto e quindi chi deve mettere benzina**, senza discussioni e senza tenere i conti a mente.

Il flusso base è:

1. Salgo sul mezzo → l'app mi mostra i km attuali (ultimo valore registrato) → **avvio la corsa** confermando/correggendo il contachilometri.
2. Scendo → inserisco i km finali → l'app calcola i km percorsi, i litri consumati stimati e **quanto ho speso in carburante**.
3. Quando qualcuno fa rifornimento, registra litri + prezzo al litro + totale pagato → quell'importo gli viene **accreditato**.
4. In qualsiasi momento ognuno vede il proprio **saldo**: se è in rosso, l'app gli dice a quanti euro (e a quanti litri, al prezzo corrente) ammonta il debito.

L'app è **mobile-first**: si usa in piedi accanto alla macchina, con una mano, spesso al buio in garage. La registrazione di una corsa deve richiedere **meno di 10 secondi e non più di 2 tap + una tastiera numerica**.

---

## 3. Modello dei dati

Usa nomi in inglese nel codice/DB e in italiano nella UI. Tutte le tabelle con `created_at`, `updated_at`, e soft delete dove ha senso.

### `users`
`id`, `name`, `username/email`, `password_hash`, `role` (`admin` | `member`), `color` (per i grafici), `active`, `notification_prefs`.

### `vehicles`
`id`, `name`, `type` (`car` | `scooter`), `plate`, `fuel_type` (`benzina` | `diesel` | `gpl`), `declared_consumption_km_l`, `computed_consumption_km_l` (calcolato, nullable), `tank_capacity_l`, `current_odometer_km`, `owner_note`, `icon/color`, `active`, `discrepancy_threshold_km` (soglia oltre la quale scatta la corsa da reclamare, default 5 per le auto e 3 per lo scooter), `drift_buffer_km` (accumulatore delle discrepanze sotto soglia).

### `vehicle_members` (chi partecipa alla ripartizione di quel mezzo)
`vehicle_id`, `user_id`, `share_fixed_costs` (bool).
→ Serve perché **la nonna non deve entrare nei conteggi della 500**: i suoi km vanno registrabili ma esclusi dalla ripartizione. Prevedi un flag `excluded_from_billing` o un "utente non fatturabile".

### `trips`
`id`, `vehicle_id`, `user_id`, `odometer_start_km`, `odometer_end_km`, `distance_km` (derivato), `started_at`, `ended_at`, `status` (`open` | `closed`), `note`, `passengers` (array di `user_id`, opzionale → costo diviso tra i presenti), `cost_cents`, `liters_estimated`, `unit_price_used_cents`.

> I costi calcolati vanno **congelati sulla riga** al momento della chiusura della corsa: se domani cambia il prezzo del carburante o il consumo ricalibrato, lo storico non deve cambiare retroattivamente.

### `unclaimed_trips` (corse da reclamare) — vedi Sezione 4.5
`id`, `vehicle_id`, `odometer_start_km` (ultimo valore salvato), `odometer_end_km` (valore reale rilevato), `distance_km`, `window_start_at` (data dell'ultimo evento registrato su quel mezzo), `detected_at`, `detected_by_user_id`, `liters_estimated`, `unit_price_used_cents`, `cost_cents` (congelati al rilevamento), `status` (`pending` | `claimed` | `split` | `non_billable` | `cancelled`), `claimed_by_user_id`, `resolved_at`, `resolution_note`, `deadline_at`.

### `unclaimed_trip_responses`
`unclaimed_trip_id`, `user_id`, `answer` (`mine` | `not_mine`), `answered_at`.
→ Le risposte sono **visibili a tutti**: è l'unico deterrente contro il "non sono stato io" sistematico.

### `refuels`
`id`, `vehicle_id`, `user_id`, `liters`, `price_per_liter_cents`, `total_cents`, `odometer_km`, `is_full_tank` (bool, importante), `station_name`, `refueled_at`, `receipt_photo_path` (opzionale).

### `expenses` (costi fissi e manutenzione)
`id`, `vehicle_id`, `paid_by_user_id`, `category` (`assicurazione` | `bollo` | `revisione` | `tagliando` | `gomme` | `riparazione` | `altro`), `amount_cents`, `date`, `period_start`, `period_end`, `split_rule` (`equal` | `by_km` | `custom` | `none`), `note`.

### `ledger_entries` — **il cuore contabile, append-only**
`id`, `user_id`, `vehicle_id`, `type` (`consumption_charge` | `refuel_credit` | `expense_charge` | `expense_credit` | `settlement` | `adjustment`), `amount_cents` (segno: negativo = addebito, positivo = accredito), `source_type` + `source_id` (riferimento alla riga d'origine), `occurred_at`, `description`.
→ Nessuna riga si modifica o si cancella mai: le correzioni si fanno con una **riga di storno** che referenzia l'originale. Il saldo è sempre `SUM(amount_cents)` per utente. Questo rende ogni euro tracciabile e le discussioni impossibili.

### `settlements` (pareggi)
`id`, `from_user_id`, `to_user_id`, `amount_cents`, `method` (`contanti` | `satispay` | `bonifico` | `rifornimento`), `date`, `note`, `confirmed_by_recipient` (bool).
→ Un pareggio è valido solo quando **chi riceve conferma**: evita i "ti ho dato 20 euro" non registrati.

### `deadlines` (scadenze)
`id`, `vehicle_id`, `type` (`assicurazione` | `bollo` | `revisione` | `tagliando`), `due_date`, `due_odometer_km` (per il tagliando), `notify_days_before`, `completed`.

### `audit_log`
Chi ha fatto cosa e quando, su ogni scrittura sensibile (modifica km, cancellazione corse, cambio consumo, creazione pareggi).

### `fuel_price_snapshots`
Cache dei prezzi medi giornalieri per tipo di carburante (vedi Fase 5).

---

## 4. Regole di business — la matematica (parte critica)

Implementa tutto in un modulo puro, es. `src/lib/billing/`, con test unitari. **Tutti gli importi in centesimi interi**, mai in float.

### 4.1 Costo di una corsa

```
km            = odometer_end - odometer_start
consumo_km_l  = computed_consumption_km_l ?? declared_consumption_km_l
litri_stimati = km / consumo_km_l
costo         = litri_stimati × prezzo_riferimento_al_litro
```

**Prezzo di riferimento** — usa la prima fonte disponibile, in quest'ordine, e salva quale hai usato:

1. **Costo medio ponderato del carburante nel serbatoio**: media dei rifornimenti recenti di quel mezzo pesata sui litri. È il metodo più corretto perché addebita il carburante che stai effettivamente bruciando.
2. Prezzo dell'ultimo rifornimento di quel mezzo.
3. Prezzo medio regionale (Fase 5) o valore di fallback configurabile a mano.

Se ci sono passeggeri registrati sulla corsa, il costo si divide tra chi era a bordo (di default no: chi guida paga tutto, ma il campo deve esistere).

### 4.2 Ricalibrazione automatica del consumo (metodo pieno-a-pieno)

Questa è la funzione che rende l'app affidabile nel tempo, molto più della stima teorica da libretto:

```
Tra due rifornimenti consecutivi entrambi marcati "pieno":
consumo_reale_km_l = (odometer_pieno_n − odometer_pieno_n−1) / litri_del_pieno_n
```

`computed_consumption_km_l` = media mobile degli ultimi 3-5 valori validi. Scarta gli outlier (>30% dalla mediana). Mostra sempre in UI se il consumo in uso è **stimato da libretto** o **misurato sul campo**, e con quanti pieni è stato calcolato.

### 4.3 Saldo di un utente

```
saldo = Σ(accrediti) − Σ(addebiti)     [dalla tabella ledger_entries]

accrediti  = rifornimenti pagati + spese fisse pagate + pareggi versati
addebiti   = costo consumi delle proprie corse + quote spese fisse + pareggi ricevuti
```

- `saldo < 0` → **è in debito**: deve mettere carburante o pagare gli altri.
- `saldo > 0` → **è in credito**: ha anticipato più di quanto ha consumato.
- La somma dei saldi di tutti deve sempre fare **zero** (a meno del carburante nei serbatoi già pagato ma non ancora consumato). Scrivi un test che verifica questa invariante.

**"Quanto devo mettere?"** → `litri_da_mettere = |saldo| / prezzo_corrente_al_litro`, arrotondato a 5 € in eccesso, con una frase chiara: *"Sei indietro di 23,40 € — al prossimo pieno metti circa 25 €."*

### 4.4 Ripartizione delle spese fisse

- `equal`: diviso tra i membri attivi del mezzo.
- `by_km`: `quota_i = spesa × (km_percorsi_da_i nel periodo / km_totali nel periodo)`. È il criterio giusto per assicurazione, bollo e tagliandi.
- `none`: la paga chi l'ha anticipata, senza ripartizione (es. una spesa della nonna sulla 500).

### 4.5 Corse non registrate e meccanismo di reclamo — **funzionalità centrale, non accessoria**

Caso reale garantito: qualcuno usa il mezzo e si dimentica di registrare la corsa. Il contachilometri reale è **l'unica fonte di verità**: il totale dei km attribuiti agli utenti deve sempre coincidere con i km reali del mezzo, senza eccezioni.

#### Rilevamento

Ogni volta che un utente apre l'app su un mezzo o avvia una corsa, gli viene chiesto il contachilometri reale. Si calcola:

```
delta = odometer_reale − odometer_salvato
```

Ordine di valutazione (importante, non invertirlo):

1. **`delta < 0`** → errore di battitura o correzione: non creare nulla, richiedi conferma e in caso registra una correzione tracciata in audit log (solo admin).
2. **Esiste una corsa aperta su quel mezzo** → il delta appartiene a quella corsa: proponi di chiuderla attribuendola al suo proprietario. Nessun reclamo.
3. **`delta ≤ discrepancy_threshold_km`** → normale rumore (letture arrotondate, manovre, spostamenti in cortile). Non disturbare l'utente: somma il delta a `drift_buffer_km` del mezzo. Quando il buffer accumulato supera a sua volta la soglia, allora apri una corsa da reclamare e azzera il buffer. Così non si viene tempestati di notifiche per 2 km, ma non si perde nemmeno un chilometro nel lungo periodo.
4. **`delta > discrepancy_threshold_km`** → **si crea una `unclaimed_trip`**.

La corsa da reclamare porta con sé la **finestra temporale** in cui è avvenuta (dall'ultimo evento registrato su quel mezzo fino al rilevamento): serve alla gente per ricordarsi. Costo, litri e prezzo unitario si **congelano al momento del rilevamento** con le regole della 4.1.

#### Risoluzione

A chi rileva la discrepanza si chiede subito, con tre pulsanti:

- **"Li ho fatti io"** → si crea immediatamente una corsa normale intestata a lui, il delta è chiuso, si procede con la nuova corsa. Fine.
- **"Non sono stato io"** → si registra la sua risposta `not_mine`, la `unclaimed_trip` passa in stato `pending` e **parte la richiesta di reclamo a tutti gli altri membri fatturabili** del mezzo.
- **"Non lo so"** → resta `pending` senza registrare risposte, si chiede comunque agli altri.

Agli altri membri arriva una notifica esplicita e reclamabile con un tap:

> **Fiesta — 72 km non registrati** tra il 20 e il 24 luglio, ≈ 9,60 €. Sono tuoi?  →  **Sì, sono miei** / **No, non sono miei**

Regole di chiusura:

- **Un utente reclama** (`mine`) → la corsa gli viene intestata, si generano corsa + addebito a ledger, gli altri ricevono la notifica di chiusura. Se due persone reclamano la stessa corsa, il costo si divide tra loro.
- **Eliminazione**: quando tutti hanno risposto `not_mine` tranne uno, l'app **propone a quell'ultimo l'attribuzione automatica**, con un avviso chiaro e un termine (`deadline_at`, default **48 ore**). Se entro il termine non risponde né contesta, la corsa gli viene attribuita e il ledger aggiornato.
- **Nessuno reclama entro il termine, o tutti hanno risposto `not_mine`** → la corsa passa in stato `split`: il costo si divide **in parti uguali tra tutti i membri fatturabili del mezzo escluso chi l'ha rilevata e ha dichiarato che non era sua**. Se anche questo insieme è vuoto, si divide tra tutti i membri fatturabili.
- **"Non fatturabile"** (solo admin, o utente su un mezzo con proprietario esterno) → i km si registrano sul mezzo ma nessuno viene addebitato. È il caso della nonna che usa la 500.
- L'admin può sempre riassegnare o annullare una corsa da reclamare; ogni intervento passa da uno **storno** a ledger, mai da una modifica in place, e finisce in audit log.

#### Anti-abuso

Il rischio evidente è che tutti dicano "non sono stato io" per non pagare. Le contromisure sono sociali, non tecniche, ma vanno implementate:

- Le risposte di ognuno sono **pubbliche e visibili a tutti** nel dettaglio della corsa.
- Se tutti negano, il costo si divide comunque tra tutti: negare non conviene mai rispetto a dire la verità, al massimo pareggia.
- Nel profilo di ogni utente c'è la statistica **"corse non registrate rilevate / reclamate / negate"**. Chi guida 400 km al mese e non ha mai una corsa registrata si vede.
- Notifica a tutto il gruppo quando una corsa viene chiusa in `split`: *"72 km sulla Fiesta non li ha reclamati nessuno, divisi in tre."*

#### Test da scrivere obbligatoriamente

Copri con test unitari almeno: delta sotto soglia che si accumula e poi supera la soglia; corsa aperta esistente che assorbe il delta; reclamo singolo; reclamo doppio; chiusura per eliminazione allo scadere del termine; split con tutti che negano; delta negativo rifiutato; e l'invariante che **la somma dei km attribuiti più i km non fatturabili è sempre uguale ai km reali del mezzo**.

### 4.6 Validazioni obbligatorie

- `odometer_end > odometer_start`.
- Contachilometri **monotòno crescente** per mezzo; un valore inferiore all'ultimo registrato richiede una correzione esplicita con motivazione, tracciata in audit log.
- Una sola corsa aperta per mezzo alla volta → se un altro prova ad aprirla, mostra chi ce l'ha e da quando, con opzione "prendila comunque" (magari è stata dimenticata aperta).
- Corse aperte da più di 24h: notifica di promemoria per la chiusura.
- Controllo di plausibilità: più di 1.000 km in una corsa o più di 200 km/h medi → chiedi conferma.
- Rifornimento con litri > capacità serbatoio → chiedi conferma.

---

## 5. Fasi di sviluppo

### Fase 0 — Fondamenta
- Setup repo, TypeScript strict, ESLint + Prettier, struttura cartelle.
- Docker multi-stage + `docker-compose.yml` + `.env.example`.
- Schema DB completo + migrazioni + seed con i tre mezzi reali e gli utenti di famiglia.
- Modulo `billing/` con tutte le formule della Sezione 4 e **test unitari già verdi**, prima ancora della UI.
- Health check endpoint.
- `CLAUDE.md` e `PLAN.md`.

**Criterio di accettazione:** `docker compose up` funziona, i test passano, il DB si popola.

### Fase 1 — MVP usabile
- Autenticazione (Sezione 7) + gestione utenti.
- CRUD mezzi (con consumo, targa, alimentazione, km attuali).
- **Flusso corsa**: avvio, chiusura, calcolo costo.
- **Rilevamento discrepanze e corse da reclamare** (Sezione 4.5) completo di flusso di reclamo, eliminazione con termine e split. In questa fase le richieste di reclamo possono comparire come badge/lista dentro l'app; le notifiche push arrivano in Fase 3.
- **Registrazione rifornimento** con calcolo automatico del terzo campo (litri / €litro / totale: ne inserisci due, il terzo si compila).
- Scritture su `ledger_entries`.
- **Home**: i tre mezzi con km attuali e stato (libero / in uso da X), il mio saldo in evidenza, pulsante grande "Prendi un mezzo".
- Pagina saldi: chi deve cosa a chi.

**Criterio di accettazione:** posso usarla dal telefono per un giro reale, dall'inizio alla fine, e i numeri tornano.

### Fase 2 — Contabilità completa
- Spese fisse e manutenzione con le tre regole di ripartizione.
- **Pareggi** con conferma del destinatario.
- Ricalibrazione automatica del consumo pieno-a-pieno.
- Storico corse e rifornimenti con filtri (mezzo, utente, periodo) e correzione tramite storno.
- Audit log consultabile dall'admin.

### Fase 3 — PWA e affidabilità sul campo
- **PWA installabile** (manifest, service worker, icone) con schermata di avvio.
- **Funzionamento offline**: in garage il segnale spesso non c'è. Coda locale (IndexedDB) delle corse e dei rifornimenti registrati offline, con sync automatica al ritorno online e indicatore di stato chiaro.
- Tastierino numerico grande per il contachilometri, con pre-compilazione dell'ultimo valore noto.
- Web Push: **richieste di reclamo delle corse non registrate** (con conto alla rovescia del termine di 48h), promemoria corse aperte, notifica di nuovo debito, alert scadenze.

### Fase 4 — Scadenze, statistiche, esportazione
- Gestione scadenze (assicurazione, bollo, revisione, tagliando a km) con avvisi anticipati configurabili.
- Dashboard statistiche: km per utente/mese, costo per utente, costo medio al km per mezzo, andamento del consumo reale nel tempo, mezzo più usato.
- Esportazione CSV e riepilogo mensile stampabile.

### Fase 5 — Integrazioni esterne (opzionali, valutiamole insieme)
- **Prezzi carburante automatici**: il MIMIT pubblica quotidianamente in open data (licenza IODL 2.0, formato CSV) sia i prezzi praticati dai singoli impianti sia le medie regionali. Un job giornaliero può scaricare la media regionale del Lazio e usarla come prezzo di fallback e come suggerimento nel form di rifornimento. Dataset: `mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti`.
- **Lookup targa → modello**: mettilo dietro un'interfaccia `VehicleDataProvider` con implementazione manuale di default. ⚠️ In Italia **non esiste un'API pubblica e gratuita** targa→veicolo: i provider disponibili sono commerciali (ordine di grandezza ~0,20 € a chiamata, o piani su richiesta). Per tre mezzi inseriti una volta sola non vale il costo né la dipendenza esterna, e in più il consumo omologato da libretto è comunque ottimistico rispetto al reale: la ricalibrazione pieno-a-pieno della Fase 2 dà un dato migliore. Implementa l'adapter, lascia il provider disattivabile da configurazione, e non renderlo mai un blocco al funzionamento.
- **Bot Telegram** (secondo me la killer feature per questo caso d'uso): registrare corsa e rifornimento in chat, senza aprire il browser, con notifiche di gruppo.
- OCR del contachilometri dalla foto e OCR dello scontrino: fattibile ma trattalo come esperimento a bassa priorità.

---

## 6. Stack tecnico

Proposta (se hai obiezioni motivate, dimmele prima di partire):

- **Next.js (App Router) + TypeScript** — full-stack in un solo container, ottimo supporto PWA.
- **SQLite + Prisma** — con 4 utenti Postgres è sovradimensionato; SQLite è un file solo, banale da backuppare, e regge tranquillamente questo carico. Tieni comunque lo schema Prisma portabile verso Postgres.
- **Tailwind CSS + shadcn/ui**, `next-pwa` o Serwist per il service worker.
- **Vitest** per la logica di business, **Playwright** per un paio di flussi end-to-end (corsa completa, rifornimento).
- **Zod** per la validazione di ogni input, condivisa client/server.
- Docker multi-stage con immagine finale slim, utente non-root.

---

## 7. Autenticazione e sicurezza

L'app è esposta su internet: trattala come tale.

- Auth interna: **Argon2id** per le password, sessioni in cookie `httpOnly` + `Secure` + `SameSite=Lax`, durata lunga (30-90 giorni) perché la si usa dal telefono e non voglio rifare login ogni volta.
- Ruoli: `admin` (io: gestisco utenti, mezzi, correzioni, storni) e `member` (registra corse e rifornimenti, vede tutto in lettura).
- Registrazione **solo su invito** generato dall'admin (link con token monouso a scadenza). Nessuna signup aperta.
- Rate limiting sul login, protezione CSRF, security headers (CSP, HSTS, X-Frame-Options), nessun dato sensibile nei log.
- Valuta e proponimi in aggiunta **Cloudflare Access** davanti al tunnel come secondo livello: gratuito fino a 50 utenti, autenticazione al bordo. Se lo integriamo, l'app deve validare l'header `Cf-Access-Jwt-Assertion` e comunque continuare a funzionare anche senza (per non legarmi al vendor).
- **Backup**: script di dump giornaliero del DB (+ eventuali foto scontrini) con retention configurabile e una procedura di restore documentata e **testata almeno una volta**. Un'app di contabilità senza backup verificato non serve a niente.

---

## 8. Direzione UX / visiva

- Mobile-first vero: tutto raggiungibile col pollice, target touch ≥ 44px, dark mode di default (garage, sera).
- L'azione primaria in home è una sola e deve essere enorme: prendere/rilasciare un mezzo. Tutto il resto è secondario.
- Il saldo personale è il secondo elemento più visibile, con un messaggio in linguaggio naturale, non solo un numero.
- Ogni mezzo ha un'identità visiva propria (colore + icona) così che a colpo d'occhio si capisca su cosa si sta agendo: sbagliare mezzo è l'errore più probabile dell'app.
- Per la direzione estetica: **evita il look da dashboard SaaS generica**. Il mondo di riferimento è quello del cruscotto e del libretto di bordo — quadranti, numeri meccanici, font tecnici/mono per i chilometraggi, etichette essenziali. Prima di scrivere CSS, proponimi in 10 righe una palette (4-6 colori con hex), l'accoppiata tipografica e l'elemento "firma" dell'interfaccia, e fammela approvare.
- Testi in italiano, tono diretto e concreto ("Metti 25 € al prossimo pieno", non "Il tuo bilancio presenta un disavanzo").
- Stati vuoti ed errori utili: dicono cosa è successo e cosa fare, mai un messaggio generico.
- Accessibilità di base: focus visibile da tastiera, contrasto adeguato, `prefers-reduced-motion` rispettato.

---

## 9. Deploy

- `docker-compose.yml` con volume persistente per DB e upload, restart policy, healthcheck, limiti risorse.
- Binding solo su localhost + istruzioni per la config del tunnel Cloudflare verso `mezzi.webluca.app`.
- `README.md` con: setup dev, variabili d'ambiente, come si aggiorna, come si fa backup e restore, come si aggiunge un utente.
- Migrazioni DB che girano automaticamente all'avvio del container.

---

## 10. Cose che voglio da te oltre al codice

1. Le **domande** iniziali (max 8).
2. Eventuali **buchi logici** che vedi in questa spec: se un caso limite non l'ho considerato, dimmelo prima di implementare, non dopo.
3. Alla fine di ogni fase: cosa hai fatto, cosa hai deciso da solo, cosa resta aperto.
4. Se una funzionalità che ho chiesto è secondo te sbagliata o inutile per il caso d'uso reale, **dimmelo** invece di implementarla e basta.
