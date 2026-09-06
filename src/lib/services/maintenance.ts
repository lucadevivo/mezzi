import { notifyDueDeadlines } from './deadlines';
import { notifyUnclaimedResolved, remindOpenTrips } from './notifications';
import { resolveExpiredUnclaimed } from './unclaimed';

/**
 * La manutenzione periodica: chiudere i termini scaduti delle corse da reclamare e
 * mandare i promemoria. Non c'è uno scheduler — con quattro utenti basta appoggiarsi
 * a chi apre l'app — ma **non deve stare davanti al rendering**.
 *
 * Prima girava dentro il layout, awaitata: `notify()` parla davvero con i server push
 * di Apple e Google, quindi ogni cambio di sezione aspettava una richiesta HTTP verso
 * l'esterno. Da fuori sembrava un'app lenta; era un'app che spediva notifiche.
 *
 * Ora parte in sottofondo e al massimo una volta al minuto. Il conto dei badge può
 * essere vecchio di un giro: è un badge, non un saldo.
 */
const OGNI_MS = 60_000;

let ultimoGiro = 0;
let inCorso = false;

async function giro(): Promise<void> {
  for (const resolved of resolveExpiredUnclaimed()) {
    await notifyUnclaimedResolved(resolved.id, resolved.chargedTo, resolved.status);
  }
  await remindOpenTrips();
  await notifyDueDeadlines();
}

export function scheduleMaintenance(now = Date.now()): void {
  if (inCorso || now - ultimoGiro < OGNI_MS) return;
  ultimoGiro = now;
  inCorso = true;

  // Volutamente senza await: chi ha chiesto una pagina non deve aspettare le push.
  void giro()
    .catch((error) => console.error('Manutenzione fallita:', error))
    .finally(() => {
      inCorso = false;
    });
}
