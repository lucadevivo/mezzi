# CLAUDE.md — App mezzi condivisi

App per gestire tre mezzi condivisi in famiglia: chi ha consumato quanto, chi deve mettere benzina.
Spec di riferimento: `SPEC.md`. Piano e stato: `PLAN.md` (tenerlo aggiornato a ogni fase).

## Stack

| Cosa | Scelta | Perché |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | full-stack in un container, buon supporto PWA |
| DB | SQLite (`better-sqlite3`) + Drizzle ORM | 3-5 utenti; un file solo, backup banale |
| UI | Tailwind CSS + shadcn/ui | mobile-first, dark mode di default |
| Auth | Better Auth, hashing Argon2id | l'app è esposta su internet: niente auth fatta a mano |
| Validazione | Zod, schemi condivisi client/server | |
| Test | Vitest (logica), Playwright (2 flussi e2e) | |
| PWA | Serwist | offline queue in Fase 3 |

## Comandi

```bash
npm run dev            # dev server
npm test               # Vitest
npm run test:e2e       # Playwright
npm run lint           # ESLint
npm run build          # build di produzione
npm run db:generate    # genera la migrazione dallo schema Drizzle
npm run db:migrate     # applica le migrazioni
npm run db:seed        # seed: mezzi reali + utenti di famiglia
npm run user:password -- <email> <password>   # primo accesso admin / password persa
docker compose up -d --build
```

## Struttura

```
src/
  app/            # route App Router (UI + route handler)
  lib/
    billing/      # LOGICA PURA: nessun import di DB, framework, date "now". Solo funzioni e tipi.
    db/           # schema Drizzle, migrazioni, seed, query
    auth/         # Better Auth, inviti, sessioni
    services/     # scritture: corse, rifornimenti, reclami, ledger, audit, notifiche
    offline/      # coda IndexedDB, corsa avviata senza rete, hook di stato del browser
  components/
public/sw.js      # service worker scritto a mano: shell offline, pagina offline, push
tests/e2e/        # Playwright, sul server standalone di produzione
tests/integration/# quello che passa dal DB (riconciliazione)
```

## Uso senza rete

Il garage non prende. Corse e rifornimenti registrati offline finiscono in una coda IndexedDB e
partono da soli quando la rete torna; l'indicatore in cima alla pagina dice sempre quante
operazioni aspettano. **L'id della corsa lo genera il telefono**, così una corsa aperta offline si
può anche chiudere offline. Il server (`/api/sync`) riconosce gli id già applicati e non li rifà.

## Direzione visiva — "Vetro"

Lastre traslucide su fondo notturno, la grammatica di iOS. Il blur ha senso solo se dietro c'è
qualcosa da sfocare: la luce d'ambiente in `body::before` è quel qualcosa — **se la togli, togli
anche il vetro**.

- **Palette = modalità scura dell'app dei turni** (`~/Progetti/turn-creation-screen`): neutri puri,
  croma zero. `base #0a0a0a`, `ink oklch(0.985 0 0)`, `ink-dim oklch(0.708 0 0)`, azione primaria
  `accent oklch(0.922 0 0)` (quasi bianca, testo scuro sopra). `surface` e `surface-2` sono bianchi
  trasparenti che sul fondo cadono esattamente sui grigi dei turni (0.205 e 0.269).
- **Un solo colore vivo in tutta l'app**: `debt`, il rosso di sistema dei turni. Si accende solo
  quando si deve davvero qualcosa. Non esiste un verde per il credito — il credito è bianco — e le
  card non portano più la tinta identitaria di mezzi e utenti: su un fondo neutro stonavano, e il
  rosso conserva il suo peso proprio perché è solo. I colori restano nel DB e li usano i grafici.
- **Niente luci d'ambiente**: il fondo è nero pieno. Il blur di `.glass` resta dove serve davvero,
  cioè sotto la tab bar e i pulsanti che galleggiano sopra il contenuto che scorre.
- Due classi in `@layer components`: `.glass` (blur + saturate + bordo chiaro in alto come riflesso
  speculare) e `.glass-2` per i livelli interni, senza un secondo blur — sarebbe GPU sprecata.
  Stanno in `@layer components` apposta: le utility Tailwind devono poterle sovrascrivere.
- Font: **Geist e Geist Mono**, gli stessi dell'app delle pizze (`~/Progetti/pizza-delivery-app`),
  serviti da `next/font` dal nostro dominio: nessuna chiamata a Google a runtime, la PWA regge
  anche senza rete. I numeri (`.tabular`) vanno in Geist Mono con `lining-nums tabular-nums`:
  cifre di uguale larghezza, il contachilometri non balla.
- Raggi larghi (`--radius-card: 22px`, controlli `rounded-2xl`), titolone `.title-lg` da 34px.
- Ogni mezzo tinge la sua card (bordo + sfumatura diagonale dal lato), **non** una banda sul
  fianco: sbagliare mezzo è l'errore più probabile dell'app e a colpo d'occhio deve essere
  evidente, ma sul vetro la luce arriva da un lato, non a strisce. Sul fondo neutro la tinta va
  tenuta bassa (`1f` di alpha): tarata più forte urlava.

**I colori identitari di utenti e mezzi (nel seed) sono validati, non scelti a occhio**: banda di
luminosità per fondo scuro, soglia di croma, separazione sotto daltonismo, contrasto. La coppia
Fiat 500 / Scarabeo di prima era indistinguibile in deuteranopia. Se ne cambi uno, rivalida.

La navigazione sta **in fondo** (`src/components/tab-bar.tsx`, tab bar di vetro flottante con
safe-area): sopra il pollice non ci arriva. Quattro voci — Mezzi, Saldi, Reclami, Altro — e non di
più: una barra più lunga sfonda la larghezza del telefono. Tutto il resto sta dentro "Altro".
L'azione della pagina (es. "Chiudi la corsa") sta sopra la tab bar, mai sotto.

**Niente `loading.tsx` nel gruppo `(app)`.** Ci è stato, per far vedere qualcosa mentre la pagina
arriva, ed è stato tolto: con un `redirect()` dentro una server action su rotte dinamiche il client
resta appeso a caso — misurato, 2 fallimenti su 5 con lo scheletro, 0 su 5 senza. Il pulsante
«Chiudi la corsa» che resta disabilitato per sempre vale più di qualche decimo di secondo di
sensazione. Se lo rimetti, misura di nuovo.

**Home e rifornimento entrano senza scorrere in 393×620**, ed è un vincolo, non un caso: 620 è
quello che resta di un iPhone quando Safari tiene le sue barre, e il pulsante «Registra il
rifornimento» deve stare sopra la piega. Per starci sono spariti il quadrante del saldo
(`SaldoGauge`) e, dal rifornimento, i campi che nessuno compilava. Nel `TankGauge` quadrante e
lettura stanno **affiancati**: in colonna si mangiavano mezzo schermo. Se aggiungi qualcosa a
queste due schermate, **rimisura** — a 620 non c'è un pixel di margine.

## Regole non negoziabili

1. **`src/lib/billing/` resta puro.** Nessuna dipendenza da DB, framework o clock di sistema: il tempo si passa come parametro. Ogni formula ha un test.
2. **Il saldo è in chilometri, non in euro.** `SUM(amount_km)` sul ledger. Guidare toglie km, mettere carburante ne aggiunge: **i soldi diventano chilometri in un punto solo**, al rifornimento (`litri × km/l`). Positivo = autonomia già pagata; negativo = km fatti e non ancora coperti. Il denaro resta sui rifornimenti come memoria di spesa, ma non entra nel saldo.
3. **Si pareggia mettendo carburante, non passandosi contanti.** Non esistono pareggi né spese fisse: se ne è discusso e sono stati tolti apposta, non dimenticati.
4. **Importi in centesimi interi, chilometri in decimi.** Mai float per il denaro; per i km si divide sempre in decimi (`splitTripKm`) così la somma delle quote torna esatta.
5. **`ledger_entries` è append-only.** Nessun UPDATE, nessun DELETE: le correzioni sono righe di storno che referenziano l'originale.
6. **Il contachilometri è l'unica fonte di verità.** Somma dei km attribuiti + km non fatturabili = km reali del mezzo. C'è un test che lo verifica.
7. **Due invarianti sotto test:** somma dei saldi = chilometri che il carburante in serbatoio può ancora fare (`autonomyInTankKm`), e somma dei km (punto 6).
8. **Il livello del serbatoio è una frazione, non quattro caselle.** `tank_fraction_after` va da 0 a 1 e si segna trascinando la lancetta come sul cruscotto (`TankGauge`). È **facoltativo** e di suo resta `null`: obbligare a scegliere un livello quando la lancetta sta in mezzo produce dati falsi, e i dati falsi qui diventano chilometri sbagliati.
9. **Il consumo si misura serbatoio-a-serbatoio, non pieno-a-pieno.** In questa famiglia il pieno non lo fa quasi mai nessuno — venti euro alla volta — quindi aspettare due pieni vuol dire non misurare mai. Con due letture della lancetta il carburante bruciato è `capacità × (livello prima − livello dopo) + litri messi` (`burnedBetween`): con due pieni la formula si riduce ai litri del secondo, cioè al metodo classico. Campioni rumorosi: mediana, outlier scartati, sotto tre campioni si resta sul libretto. Il consumo misurato **non ricalcola gli accrediti già dati**: vale per i prossimi.
10. **Nessun segreto nel codice.** Tutto da `.env`, con `.env.example` versionato.
11. **Niente over-engineering.** 3-5 utenti. Monolite leggibile, nessuna astrazione senza un secondo caso d'uso reale.

## Categorie dei tragitti

Etichette libere («consegne», «palestra») che si scrivono **chiudendo la corsa**, in un campo con la
tendina dei suggerimenti: si sceglie una già usata o se ne scrive una nuova, che nasce da sé
(`resolveCategory`). Sono minuscole e normalizzate, così «Palestra» e «palestra» restano la stessa
cosa. Non c'è una schermata per gestirle, ed è voluto: con quattro persone e cinque etichette
sarebbe una cerimonia. Nello storico compaiono come pastiglia sulla riga e c'è la tendina per
filtrare, che appare solo quando almeno un'etichetta esiste.

## Convenzioni

- Codice e DB in **inglese**, UI in **italiano** (tono diretto: "Metti 25 € al prossimo pieno").
- Commit Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`), piccoli e frequenti, uno per unità logica.
- Date/ora salvate in UTC, mostrate in `Europe/Rome`.
- Target touch ≥ 44px, dark mode di default, `prefers-reduced-motion` rispettato.

## Modello utenti (importante)

Un solo modello `users` con due flag:

- `billable` — entra nella ripartizione dei costi. Nonna, ospiti e pagatori esterni: `false`.
- `can_login` — ha credenziali. Utenti "registrati dall'admin" (nonna): `false`; le loro corse le crea solo l'admin.

I movimenti degli utenti non fatturabili finiscono comunque a ledger (così i km tornano col contachilometri),
ma non compaiono nella pagina "chi deve cosa a chi".

## Deploy

**Due trappole pagate, entrambe dello stesso tipo: `git archive | ssh 'tar x'` è un
*aggiornamento*, non una copia fedele.**

- **Non cancella niente.** I file tolti dal repo restano sul server e finiscono nel
  contesto di build: dopo una cancellazione va fatto `rm -rf ~/apps/mezzi/src
  ~/apps/mezzi/tests` prima di estrarre, altrimenti il build fallisce su import morti.
- **Archivia la cartella da cui lo lanci.** Una volta è partito con la shell dentro
  `~/brain` e sul server è finito il vault personale (`claude-memory/`, `conversations/`,
  `BRAIN.md`). Sempre `git -C ~/Progetti/mezzi archive …`, e dopo un deploy strano
  guarda cosa c'è davvero in `~/apps/mezzi`.


- Docker multi-stage, immagine slim, utente non-root, migrazioni automatiche all'avvio.
- Binding su `127.0.0.1:${PORT}` (default 8430). Nessuna porta aperta sul router.
- Ingresso da Cloudflare Tunnel su `mezzi.webluca.app` (stesso `cloudflared` di luca-server).
- Container e volumi con prefisso `mezzi-` per convivere con gli altri servizi del server.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **mezzi** (855 symbols, 1977 relationships, 66 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/mezzi/context` | Codebase overview, check index freshness |
| `gitnexus://repo/mezzi/clusters` | All functional areas |
| `gitnexus://repo/mezzi/processes` | All execution flows |
| `gitnexus://repo/mezzi/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
