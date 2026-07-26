# Mezzi

App per gestire i mezzi condivisi in famiglia: chi ha consumato quanto, chi deve mettere benzina.

Spec: `SPEC.md` · Piano e stato: `PLAN.md` · Convenzioni per lavorarci: `CLAUDE.md`

## Sviluppo

```bash
cp .env.example .env          # e riempi AUTH_SECRET: openssl rand -base64 32
npm install
npm run db:migrate
npm run db:seed               # 3 mezzi reali + utenti di famiglia
npm run dev
```

Test e controlli:

```bash
npm test          # logica di calcolo (billing/)
npm run typecheck
npm run lint
```

## Variabili d'ambiente

Tutte in `.env`, documentate in `.env.example`. `AUTH_SECRET` è l'unica obbligatoria:
senza, l'app non parte (ed è voluto).

## Produzione

```bash
docker compose up -d --build
```

L'app ascolta solo su `127.0.0.1:${PORT}` (default 8430): l'unico ingresso da internet è il
tunnel Cloudflare verso `mezzi.webluca.app`. Nessuna porta aperta sul router.
Le migrazioni girano da sole all'avvio del container, quindi aggiornare vuol dire rilanciare
lo stesso comando.

## Backup e restore

Il database è un file solo. Backup a caldo, senza fermare l'app:

```bash
docker exec mezzi-app node -e "require('better-sqlite3')('/app/data/mezzi.db').backup('/app/data/backup.db')"
docker cp mezzi-app:/app/data/backup.db ./mezzi-$(date +%F).db
```

Restore: ferma il container, sostituisci il file nel volume `mezzi-data`, riavvia.

> La procedura di restore va provata almeno una volta prima di considerare l'app in produzione.

## Aggiungere un utente

Dalla UI, da admin: si genera un link di invito monouso a scadenza. Non esiste registrazione
aperta. Gli utenti che non devono accedere (nonna, ospiti) si creano senza credenziali:
le loro corse le registra l'admin.
