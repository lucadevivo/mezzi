# CLAUDE.md — App mezzi condivisi

App per gestire tre mezzi condivisi in famiglia: chi ha consumato quanto, chi deve mettere benzina.
Spec di riferimento: `SPEC.md`. Piano e stato: `PLAN.md` (tenerlo aggiornato a ogni fase).

## Stack

| Cosa | Scelta | Perché |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript strict | full-stack in un container, buon supporto PWA |
| DB | SQLite + Drizzle ORM | 3-5 utenti; un file solo, backup banale, niente engine binary nell'immagine |
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
  components/
tests/
```

## Regole non negoziabili

1. **`src/lib/billing/` resta puro.** Nessuna dipendenza da DB, framework o clock di sistema: il tempo si passa come parametro. Ogni formula ha un test.
2. **Importi in centesimi interi.** Mai float per il denaro.
3. **`ledger_entries` è append-only.** Nessun UPDATE, nessun DELETE: le correzioni sono righe di storno che referenziano l'originale. Il saldo è sempre `SUM(amount_cents)`.
4. **Costi congelati alla riga.** Litri, prezzo unitario e costo si scrivono alla chiusura della corsa (o al rilevamento della discrepanza) e non si ricalcolano mai retroattivamente.
5. **Il contachilometri è l'unica fonte di verità.** Somma dei km attribuiti + km non fatturabili = km reali del mezzo. C'è un test che lo verifica.
6. **Due invarianti sotto test:** somma dei saldi = 0 (a meno del carburante pagato e non ancora consumato) e somma dei km (punto 5).
7. **Nessun segreto nel codice.** Tutto da `.env`, con `.env.example` versionato.
8. **Niente over-engineering.** 3-5 utenti. Monolite leggibile, nessuna astrazione senza un secondo caso d'uso reale.

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
