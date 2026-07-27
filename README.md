# Mezzi

App per gestire i mezzi condivisi in famiglia: chi ha consumato quanto, chi deve mettere benzina.

Spec: `SPEC.md` · Piano e stato: `PLAN.md` · Convenzioni per lavorarci: `CLAUDE.md`

## Sviluppo

```bash
cp .env.example .env          # e riempi AUTH_SECRET: openssl rand -base64 32
npm install
npm run db:migrate
npm run db:seed               # 3 mezzi reali + utenti di famiglia
npm run user:password -- luca@mezzi.local "una password lunga"
npm run dev
```

Il seed crea gli utenti senza credenziali: `user:password` serve a far entrare il primo admin.
Da lì in poi gli altri arrivano con un link di invito generato dalla pagina Admin.

Test e controlli:

```bash
npm test          # logica di calcolo (billing/)
npm run test:e2e  # Playwright: corsa completa, rifornimento, reclamo
npm run typecheck
npm run lint
```

## Variabili d'ambiente

Tutte in `.env`, documentate in `.env.example`. `AUTH_SECRET` è l'unica obbligatoria:
senza, l'app non parte (ed è voluto).

Per le notifiche push servono anche le chiavi VAPID (`npx web-push generate-vapid-keys`).
Se mancano, l'app funziona identica ma le notifiche restano spente.

## Installarla sul telefono

Su iPhone: apri il sito in **Safari**, tocca Condividi e poi **Aggiungi alla schermata Home**.
Va fatto per forza da lì: le notifiche push su iOS funzionano solo dall'app installata.
Da installata, corse e rifornimenti registrati senza segnale restano in coda sul telefono e
partono da soli quando la rete torna.

## Produzione

```bash
docker compose up -d --build
```

L'app ascolta solo su `127.0.0.1:${PORT}` (default 8430): l'unico ingresso da internet è il
tunnel Cloudflare verso `mezzi.webluca.app`. Nessuna porta aperta sul router.
Le migrazioni girano da sole all'avvio del container, quindi aggiornare vuol dire rilanciare
lo stesso comando.

## Deploy su luca-server

L'app gira in `~/apps/mezzi` su luca-server, dietro il tunnel Cloudflare già esistente,
su **https://mezzi.webluca.app**. Il container sta nella rete `turni_default` perché è lì
che vive `cloudflared`, che raggiunge i servizi per nome.

Aggiornare (dalla macchina di sviluppo):

```bash
git archive --format=tar HEAD | gzip | ssh -p 52222 luca-server 'tar xzf - -C ~/apps/mezzi'
ssh -p 52222 luca-server 'cd ~/apps/mezzi && docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build'
```

Migrazioni e seed girano da soli all'avvio: su un volume vuoto l'app si popola da sola.

## Backup e restore

```bash
./scripts/backup.sh                                  # in cron ogni notte alle 4
./scripts/restore.sh ~/backups/mezzi/mezzi-*.db.gz   # ripristino
```

Il backup usa `.backup` di SQLite, non `cp`: copiare il file mentre l'app scrive dà un backup
rotto in silenzio. Il restore non cancella niente — mette da parte il database attuale come
`mezzi.db.pre-restore-<data>` dentro il volume, così si può sempre tornare indietro.
Retention 30 giorni, configurabile con `MEZZI_BACKUP_RETENTION_DAYS`.

> **Provato il 27/07/2026 in produzione**: registrato un rifornimento vero, ripristinato il
> backup precedente, verificato che il rifornimento era sparito, che gli utenti c'erano ancora
> e che il login funzionava. Da rifare se cambia lo schema del database.

## Aggiungere un utente

Dalla UI, da admin: si genera un link di invito monouso a scadenza. Non esiste registrazione
aperta. Gli utenti che non devono accedere (nonna, ospiti) si creano senza credenziali:
le loro corse le registra l'admin.

Password persa, o primo accesso su un'installazione nuova:

```bash
# in sviluppo
npm run user:password -- luca@mezzi.local "una password lunga"
# in produzione (l'immagine non contiene tsx)
docker exec mezzi-app node scripts/set-password.mjs luca@mezzi.local "una password lunga"
```
