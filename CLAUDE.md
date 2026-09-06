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
  `accent oklch(0.922 0 0)` (quasi bianca, testo scuro sopra), `debt` = destructive dei turni.
  Il `credit` verde non esiste nei turni: è stato aggiunto tenendo la stessa croma del rosso, così
  debito e credito pesano uguale. `surface` e `surface-2` sono bianchi trasparenti che sul fondo
  cadono esattamente sui grigi dei turni (0.205 e 0.269).
- Due classi in `@layer components`: `.glass` (blur + saturate + bordo chiaro in alto come riflesso
  speculare) e `.glass-2` per i livelli interni, senza un secondo blur — sarebbe GPU sprecata.
  Stanno in `@layer components` apposta: le utility Tailwind devono poterle sovrascrivere.
- Font: **stack di sistema**, che su iPhone è SF Pro vero. Nessun font di rete somiglia a iOS
  quanto il font di iOS, e non si scarica niente.
- **I numeri vanno in grazie**: `.tabular` usa `ui-serif` (New York su iPhone, Georgia altrove) con
  `lining-nums tabular-nums`. Un contachilometri è uno strumento, non un terminale; il `lining`
  serve perché Georgia di suo scriverebbe cifre minuscole.
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

**La home entra in uno schermo da 393×852 senza scorrere**, ed è un vincolo, non un caso: saldo,
tre mezzi e suggerimento. Per farcela è sparito il quadrante del saldo (`SaldoGauge`): di un saldo
interessa la cifra. Se aggiungi qualcosa alla home, misura di nuovo.

## Regole non negoziabili

1. **`src/lib/billing/` resta puro.** Nessuna dipendenza da DB, framework o clock di sistema: il tempo si passa come parametro. Ogni formula ha un test.
2. **Importi in centesimi interi.** Mai float per il denaro.
3. **`ledger_entries` è append-only.** Nessun UPDATE, nessun DELETE: le correzioni sono righe di storno che referenziano l'originale. Il saldo è sempre `SUM(amount_cents)`.
4. **Costi congelati alla riga.** Litri, prezzo unitario e costo si scrivono alla chiusura della corsa (o al rilevamento della discrepanza) e non si ricalcolano mai retroattivamente.
5. **Il contachilometri è l'unica fonte di verità.** Somma dei km attribuiti + km non fatturabili = km reali del mezzo. C'è un test che lo verifica.
6. **Due invarianti sotto test:** somma dei saldi = valore del carburante pagato e non ancora consumato, e somma dei km (punto 5).
7. **Il livello del serbatoio è una frazione, non quattro caselle.** `tank_fraction_after` va da 0 a 1 e si segna trascinando la lancetta come sul cruscotto (`TankGauge`). È **facoltativo** e di suo resta `null`: obbligare a scegliere «pieno» quando la lancetta sta a metà falsifica la calibrazione del consumo, che è tutta costruita sui pieni veri. Solo `1` conta come pieno.
8. **Ogni pieno riconcilia.** I litri del pieno sono il carburante davvero bruciato dal pieno precedente: la differenza rispetto ai litri stimati e già addebitati si redistribuisce con righe `adjustment`. Senza questo passaggio i saldi scivolano via e l'invariante 6 smette di valere.
9. **Nessun segreto nel codice.** Tutto da `.env`, con `.env.example` versionato.
10. **Niente over-engineering.** 3-5 utenti. Monolite leggibile, nessuna astrazione senza un secondo caso d'uso reale.

## Convenzioni

- Codice e DB in **inglese**, UI in **italiano** (tono diretto: "Metti 25 € al prossimo pieno").
- Commit Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`), piccoli e frequenti, uno per unità logica.
- Date/ora salvate in UTC, mostrate in `Europe/Rome`.
- Target touch ≥ 44px, dark mode di default, `prefers-reduced-motion` rispettato.

## Modello utenti (importante)

Un solo modello `users` con due flag:

- `billable` — entra nella ripartizione dei costi. Nonna, ospiti e pagatori esterni: `false`.
- `can_login` — ha credenziali. Utenti "registrati dall'admin" (nonna): `false`; le loro corse le crea solo l'admin.

I movimenti degli utenti non fatturabili finiscono comunque a ledger (così l'invariante somma=0 regge),
ma non compaiono nella pagina "chi deve cosa a chi".

## Deploy

- Docker multi-stage, immagine slim, utente non-root, migrazioni automatiche all'avvio.
- Binding su `127.0.0.1:${PORT}` (default 8430). Nessuna porta aperta sul router.
- Ingresso da Cloudflare Tunnel su `mezzi.webluca.app` (stesso `cloudflared` di luca-server).
- Container e volumi con prefisso `mezzi-` per convivere con gli altri servizi del server.
