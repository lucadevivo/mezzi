# PLAN.md — App mezzi condivisi

Piano di sviluppo. Una fase alla volta, con approvazione esplicita prima di passare alla successiva.
Stato: `[ ]` da fare · `[~]` in corso · `[x]` fatto.

---

## Decisioni prese prima di iniziare

| Tema | Decisione |
|---|---|
| Utenti non fatturabili | Un solo modello `users` con flag `billable` e `can_login`. Nonna, ospiti e pagatori esterni sono utenti `billable:false`. I loro movimenti restano a ledger (l'invariante somma=0 regge), ma non compaiono in "chi deve cosa". |
| Assegnazione km nonna | Solo l'admin può creare corse a nome di un utente `can_login:false`. |
| Riconciliazione | A ogni rifornimento si registra `tank_level_after` (`quarter`/`half`/`three_quarters`/`full`). Pieno→pieno = riconciliazione esatta + calibrazione consumo. Livelli parziali = riconciliazione stimata. |
| Prezzo carburante | Inserito dall'utente a ogni rifornimento. Il costo corsa usa la media ponderata dei litri stimati in serbatoio; fallback: ultimo prezzo del mezzo; fallback finale: valore configurabile. |
| Corsa aperta + delta km | Il delta viene **proposto** al proprietario della corsa aperta, non addebitato d'ufficio. Se la corsa è aperta da più di `OPEN_TRIP_ABSORB_HOURS` (default 24), il delta non viene assorbito: diventa una corsa da reclamare aperta a tutti. |
| Passeggeri | Default: chi guida paga tutto. Si possono aggiungere passeggeri (utenti o ospiti non fatturabili) e il costo si divide in parti uguali tra i presenti. |
| Pareggi | Rimosso `method='rifornimento'` (doppio conteggio). Metodi: contanti, satispay, bonifico. |
| Notifiche | Web Push. Su iOS funziona solo con PWA installata da Safari sulla home screen (iOS 16.4+): la Fase 3 include l'onboarding che lo spiega. Se in Fase 3 risultasse inaffidabile, ripiego sul bot Telegram in Fase 5. |
| Soft delete | Non implementato: il ledger è append-only e l'audit log traccia le modifiche. Le cancellazioni sono storni. |

## Buchi della spec risolti nel piano

1. **Drift stima/realtà** — addebiti su litri stimati vs accrediti su euro reali: risolto con la riconciliazione al rifornimento (Fase 2), che ridistribuisce la differenza pro-quota sui km del periodo con righe `adjustment`.
2. **Corsa aperta che assorbe km altrui** — risolto con conferma + finestra di 24h.
3. **Litri residui in serbatoio** — stimati da `tank_level_after` + km percorsi.
4. **Doppio conteggio pareggio/rifornimento** — risolto rimuovendo il metodo.
5. **Asimmetria dello split** — chi rileva e nega è escluso, gli altri che negano no: comportamento tenuto (è il deterrente), ma dichiarato esplicitamente in UI.
6. **Quota passeggero non fatturabile** — resta a carico dell'utente non fatturabile a ledger, non ricade sul guidatore.
7. **Contestazione dopo la scadenza** — dopo `deadline_at` l'attribuzione è definitiva: si corregge solo con uno storno admin.

---

## Fase 0 — Fondamenta

- [x] Setup repo: Next.js App Router, TypeScript strict, ESLint + Prettier, struttura cartelle.
- [x] `.env.example` + lettura config validata con Zod (fail-fast all'avvio).
- [x] Schema DB completo in Drizzle + migrazioni + seed (3 mezzi reali, Luca admin, 2 fratelli, nonna non fatturabile).
- [x] Modulo `src/lib/billing/` puro (nessuna dipendenza da DB o framework) con: costo corsa, prezzo di riferimento, calibrazione consumo, saldi, ripartizione spese, macchina a stati delle corse da reclamare, drift buffer.
- [x] Test unitari verdi su tutta la Sezione 4 della spec, inclusi i test obbligatori della 4.5 e le due invarianti (somma saldi, somma km).
- [x] Docker multi-stage, utente non-root, `docker-compose.yml`, healthcheck, volume persistente.
- [x] Endpoint `/api/health`.
- [x] `CLAUDE.md` e `PLAN.md`.

**Accettazione:** ✅ `docker compose up -d --build` avvia il container, `/api/health` risponde
`{"status":"ok"}`, le migrazioni girano da sole all'avvio, 72 test verdi, seed idempotente.

### Deciso in autonomia in Fase 0

- **Driver SQLite `better-sqlite3` invece di `node:sqlite`.** La documentazione Drizzle indica
  `drizzle-orm/node-sqlite` (stdlib, nessun modulo nativo da compilare), ma quel sottopercorso
  non è ancora esportato in `drizzle-orm@0.45.2`. Il commento in `src/lib/db/index.ts` segna il
  punto in cui tornare indietro quando esce.
- **Migrazioni via `src/instrumentation.ts`** invece che con uno script separato nel container:
  l'immagine standalone non contiene `tsx`, e così aggiornare resta un solo comando.
- **`splitCentsByWeight` col metodo dei resti massimi**: le quote sommano sempre al totale, che è
  la condizione perché il ledger stia in piedi.
- **Nomi dei fratelli**: Luca (admin), Matteo, Gabriele, più la nonna non fatturabile.

## Fase 1 — MVP usabile ✅

- [x] Auth: Better Auth con Argon2id, sessioni cookie httpOnly/SameSite=Lax a 60 giorni, inviti monouso a scadenza (7 giorni), rate limit sul login (5 tentativi al minuto).
- [x] Ruoli admin/member + pagina admin con inviti, utenti e mezzi.
- [x] Flusso corsa: avvio con lettura contachilometri, chiusura, calcolo e congelamento dei costi.
- [x] Rilevamento discrepanze completo (4.5): drift buffer, corsa aperta con conferma e finestra di 24h, corse da reclamare, tre pulsanti, reclamo singolo/doppio, eliminazione con termine 48h, split, assegnazione a utente non fatturabile.
- [x] Rifornimento: calcolo automatico del terzo campo, livello serbatoio, pagatore esterno.
- [x] Scritture su `ledger_entries` per ogni evento, con gli storni già pronti.
- [x] Home mobile-first: tre mezzi con km e stato, saldo in evidenza con frase in italiano.
- [x] Pagina saldi: chi deve cosa a chi, col numero minimo di passaggi.
- [x] Playwright: corsa completa + rifornimento + reclamo.

**Direzione visiva approvata:** "Libretto di bordo" — antracite `#14171A`, superficie `#1E2328`,
testo `#E8EAED`, ambra strumenti `#E8A33D`, debito `#D9544D`, credito `#4FB477`;
Inter Tight + JetBrains Mono tabellare; elemento firma = quadrante del saldo con ago.

**Accettazione:** ✅ 76 test unitari + 2 e2e sul server standalone di produzione, typecheck e lint puliti.

### Deciso in autonomia in Fase 1

- **CRUD mezzi rimandato**: i tre mezzi arrivano dal seed e non cambiano. La pagina admin li mostra;
  crearne di nuovi dalla UI serve solo se ne comprate un quarto.
- **`useSecureCookies` legato allo schema di `APP_URL`**, non a `NODE_ENV`: dietro il tunnel siamo
  sempre in https, in locale su http un cookie `Secure` non tornerebbe mai indietro.
- **Corse sintetiche per le corse da reclamare**: quando una `unclaimed_trip` si chiude si crea una
  corsa per ogni utente addebitato, con la sua quota di km e di costo. Serve a tenere i km attribuiti
  dentro l'invariante col contachilometri e a mostrare tutto in un unico storico.
- **Campi dei form controllati**: dopo un warning da confermare il valore digitato non deve sparire.
- **Password del primo admin** via `npm run user:password`: il seed crea gli utenti senza credenziali.

## Fase 2 — Contabilità completa

- [ ] Spese fisse e manutenzione con le tre regole di ripartizione (`equal`, `by_km`, `none`).
- [ ] Pareggi con conferma del destinatario.
- [ ] Calibrazione consumo pieno-a-pieno (media mobile 3-5 valori, scarto outlier >30% dalla mediana, indicazione in UI di stimato vs misurato).
- [ ] Riconciliazione al rifornimento con righe `adjustment`.
- [ ] Storico corse/rifornimenti con filtri e correzione tramite storno.
- [ ] Audit log consultabile dall'admin.
- [ ] Statistiche di profilo: corse non registrate rilevate/reclamate/negate.

## Fase 3 — PWA e affidabilità sul campo

- [ ] PWA installabile (manifest, icone, splash) + istruzioni "aggiungi alla home" per iOS.
- [ ] Offline: coda IndexedDB per corse e rifornimenti, sync automatica, indicatore di stato.
- [ ] Tastierino numerico grande con pre-compilazione dell'ultimo km noto.
- [ ] Web Push: reclami con countdown 48h, promemoria corse aperte, nuovo debito, scadenze.

## Fase 4 — Scadenze, statistiche, esportazione

- [ ] Scadenze (assicurazione, bollo, revisione, tagliando a km) con avvisi anticipati.
- [ ] Dashboard: km per utente/mese, costo per utente, costo medio al km, andamento del consumo reale, mezzo più usato.
- [ ] Export CSV + riepilogo mensile stampabile.

## Fase 5 — Integrazioni (da valutare insieme)

- [ ] Prezzi MIMIT come fallback (job giornaliero, media regionale Lazio).
- [ ] `VehicleDataProvider` con implementazione manuale di default (lookup targa disattivato: nessuna API pubblica gratuita in Italia).
- [ ] Bot Telegram per corsa/rifornimento in chat + notifiche di gruppo.
- [ ] OCR contachilometri/scontrino — esperimento a bassa priorità.

## Trasversale (non una fase)

- [ ] Security headers (CSP, HSTS, X-Frame-Options), protezione CSRF, nessun dato sensibile nei log.
- [ ] Backup: dump giornaliero con retention, procedura di restore documentata **e testata almeno una volta**.
- [ ] `README.md`: setup dev, variabili, aggiornamento, backup/restore, aggiunta utente.
- [ ] Valutazione Cloudflare Access davanti al tunnel (validazione `Cf-Access-Jwt-Assertion`, app funzionante anche senza).
