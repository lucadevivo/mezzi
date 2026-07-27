export const metadata = { title: 'Senza rete — Mezzi' };

/**
 * Pagina servita dal service worker quando non c'è rete e la pagina chiesta
 * non è mai stata aperta. Deve dire cosa si può fare comunque, non scusarsi.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sei senza rete</h1>
      <p className="text-ink-dim">
        Il garage non prende, lo sappiamo. Le corse e i rifornimenti che registri restano sul
        telefono e partono da soli appena torna il segnale.
      </p>
      <p className="text-ink-dim">
        Le pagine che hai già aperto continuano a funzionare: prova a tornare indietro.
      </p>
    </div>
  );
}
