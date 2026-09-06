/**
 * Lo scheletro che si vede mentre la pagina arriva.
 *
 * Le pagine sono tutte dinamiche — i saldi e i km cambiano di continuo, non c'è
 * niente da mettere in cache — quindi ogni cambio di sezione è un giro al server.
 * Senza questo, toccare una voce non faceva succedere niente per qualche decimo di
 * secondo e l'app sembrava incantata: con lo scheletro la risposta è immediata,
 * anche se il contenuto vero arriva un attimo dopo.
 */
export default function Loading() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="glass h-24 animate-pulse rounded-[var(--radius-card)]" />
      <div className="glass h-20 animate-pulse rounded-[var(--radius-card)]" />
      <div className="glass h-20 animate-pulse rounded-[var(--radius-card)]" />
      <span className="sr-only">Caricamento…</span>
    </div>
  );
}
