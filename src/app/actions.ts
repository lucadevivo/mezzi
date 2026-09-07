'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { completeRefuelAmounts, tripCost } from '@/lib/billing';
import { acceptInvite, createInvite } from '@/lib/auth/invites';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { resolveGuest } from '@/lib/services/guests';
import { getEnv } from '@/lib/env';
import { completeDeadline, createDeadline } from '@/lib/services/deadlines';
import { reverseRefuel, reverseTrip } from '@/lib/services/history';
import {
  notifyUnclaimedResolved,
  notifyUnclaimedTrip,
} from '@/lib/services/notifications';
import { removeSubscription, saveSubscription } from '@/lib/services/push';
import { recordRefuel } from '@/lib/services/refuels';
import { checkOdometer, closeTrip, startTrip, takeOverOpenTrip } from '@/lib/services/trips';
import { respondToUnclaimed, assignUnclaimedToNonBillable } from '@/lib/services/unclaimed';

export interface ActionState {
  error?: string;
  /** Warning da confermare: la stessa azione ripetuta con `conferma` passa. */
  needsConfirm?: boolean;
}

/** Trasforma "1.234,5" in 1234.5: sul telefono si scrive come viene. */
const decimal = z
  .string()
  .trim()
  .min(1)
  .transform((value) => Number(value.replace(/\./g, '').replace(',', '.')))
  .pipe(z.number().finite());

const optionalDecimal = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value.replace(/\./g, '').replace(',', '.'))))
  .pipe(z.number().finite().positive().nullable());

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : 'Qualcosa è andato storto' };
}

/* ----------------------------------- corse ---------------------------------- */

export interface OdometerCheckResult {
  kind: 'ok' | 'unclaimed' | 'open_trip' | 'error';
  message?: string;
  /** Km non registrati, quando `kind` è `unclaimed`. */
  distanceKm?: number;
  costCents?: number;
  windowStartAt?: string;
}

/**
 * Anteprima prima di avviare: serve a mostrare i tre pulsanti del reclamo
 * ("li ho fatti io" / "non sono stato io" / "non lo so") invece di addebitare in silenzio.
 */
export async function checkOdometerAction(
  vehicleId: string,
  odometerKm: number,
): Promise<OdometerCheckResult> {
  await requireUser();
  try {
    const { state, outcome } = checkOdometer(vehicleId, odometerKm);

    switch (outcome.kind) {
      case 'negative_delta':
        return {
          kind: 'error',
          message: `Il contachilometri non può tornare indietro: ultimo valore ${state.vehicle.currentOdometerKm} km.`,
        };
      case 'propose_close_open_trip':
        return { kind: 'open_trip', message: 'C’è una corsa aperta: va chiusa prima.' };
      case 'unclaimed_trip': {
        const { costCents } = tripCost({
          distanceKm: outcome.distanceKm,
          consumptionKmPerLiter: state.consumption.kmPerLiter,
          unitPriceCents: state.price.pricePerLiterCents,
        });
        return {
          kind: 'unclaimed',
          distanceKm: outcome.distanceKm,
          costCents,
          windowStartAt: outcome.windowStartAt.toISOString(),
        };
      }
      default:
        return { kind: 'ok' };
    }
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Errore' };
  }
}

const startTripSchema = z.object({
  vehicleId: z.string().min(1),
  odometerKm: decimal,
  unclaimedAnswer: z.enum(['mine', 'not_mine', 'unknown']).optional(),
});

export async function startTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = startTripSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Contachilometri non valido' };

  try {
    const result = startTrip({ ...parsed.data, userId: user.id });
    // Se sono saltati fuori km di nessuno, gli altri devono saperlo subito:
    // il termine per rispondere corre da adesso.
    if (result.unclaimedTripId && parsed.data.unclaimedAnswer !== 'mine') {
      await notifyUnclaimedTrip(result.unclaimedTripId);
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/');
  redirect(`/mezzi/${parsed.data.vehicleId}`);
}

const closeTripSchema = z.object({
  tripId: z.string().min(1),
  vehicleId: z.string().min(1),
  odometerEndKm: decimal,
  passengerIds: z.array(z.string()).optional(),
  note: z.string().trim().max(500).optional(),
  categoria: z.string().trim().max(30).optional(),
  conferma: z.string().optional(),
});

export async function closeTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const parsed = closeTripSchema.safeParse({
    ...Object.fromEntries(formData),
    passengerIds: formData.getAll('passengerIds').map(String),
  });
  if (!parsed.success) return { error: 'Contachilometri non valido' };

  try {
    closeTrip({
      tripId: parsed.data.tripId,
      odometerEndKm: parsed.data.odometerEndKm,
      passengerIds: parsed.data.passengerIds,
      note: parsed.data.note,
      category: parsed.data.categoria,
      confirmWarnings: parsed.data.conferma === 'si',
    });
  } catch (error) {
    return { ...fail(error), needsConfirm: parsed.data.conferma !== 'si' };
  }

  revalidatePath('/');
  redirect(`/mezzi/${parsed.data.vehicleId}`);
}

export async function takeOverTripAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const vehicleId = String(formData.get('vehicleId') ?? '');
  try {
    takeOverOpenTrip(vehicleId, user.id, user.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/mezzi/${vehicleId}`);
  return {};
}

/* ------------------------------- rifornimenti ------------------------------- */

const refuelSchema = z.object({
  vehicleId: z.string().min(1),
  payerId: z.string().min(1),
  odometerKm: decimal,
  // I litri non li digita piu' nessuno: restano accettati per la coda offline e per
  // chi arriva dall'API, ma il campo puo' proprio non esserci.
  liters: optionalDecimal.optional(),
  pricePerLiter: optionalDecimal,
  total: optionalDecimal,
  beneficiari: z.array(z.string()).optional(),
  /** Se il pagante è nuovo arriva un nome, non un id: l'utente ospite nasce qui. */
  nuovoPagante: z.string().trim().max(40).optional(),
  tankFractionAfter: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .pipe(z.number().min(0).max(1).nullable())
    .catch(null),
  stationName: z.string().trim().max(100).optional(),
  conferma: z.string().optional(),
});

export async function recordRefuelAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const parsed = refuelSchema.safeParse({
    ...Object.fromEntries(formData),
    beneficiari: formData.getAll('beneficiari').map(String),
  });
  if (!parsed.success) return { error: 'Dati del rifornimento non validi' };

  const { vehicleId, odometerKm, liters, pricePerLiter, total } = parsed.data;

  try {
    // «Qualcun altro…»: chi ha pagato non è un utente dell'app, e nasce adesso.
    const payerId =
      parsed.data.payerId === '__nuovo__'
        ? resolveGuest(parsed.data.nuovoPagante ?? '')
        : parsed.data.payerId;

    const amounts = completeRefuelAmounts({
      liters: liters ?? null,
      pricePerLiterCents: pricePerLiter === null ? null : Math.round(pricePerLiter * 100),
      totalCents: total === null ? null : Math.round(total * 100),
    });

    recordRefuel({
      vehicleId,
      userId: payerId,
      odometerKm,
      tankFractionAfter: parsed.data.tankFractionAfter,
      beneficiaryIds: parsed.data.beneficiari,
      stationName: parsed.data.stationName,
      confirmOverCapacity: parsed.data.conferma === 'si',
      ...amounts,
    });
  } catch (error) {
    return { ...fail(error), needsConfirm: parsed.data.conferma !== 'si' };
  }

  revalidatePath('/');
  redirect(`/mezzi/${vehicleId}`);
}

/* --------------------------- corse da reclamare ----------------------------- */

export async function respondUnclaimedAction(_prev: ActionState, formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('unclaimedTripId') ?? '');
  const answer = formData.get('answer') === 'mine' ? 'mine' : 'not_mine';

  try {
    const resolution = respondToUnclaimed(id, user.id, answer);
    if (resolution.status !== 'pending') {
      await notifyUnclaimedResolved(id, resolution.chargedTo, resolution.status);
    }
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/reclami');
  revalidatePath('/');
  return {};
}

/* ----------------------------------- spese ---------------------------------- */

const parseDay = (value?: string) => (value ? new Date(`${value}T12:00:00`) : null);

/* --------------------------------- pareggi ---------------------------------- */

/* --------------------------------- storni ----------------------------------- */

const reversalSchema = z.object({
  kind: z.enum(['trip', 'refuel']),
  id: z.string().min(1),
  reason: z.string().trim().min(3, 'Serve un motivo'),
});

/** Solo l'admin, e sempre con una motivazione: finisce in audit log. */
export async function reverseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = reversalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { kind, id, reason } = parsed.data;
  try {
    if (kind === 'trip') reverseTrip(id, admin.id, reason);
    else reverseRefuel(id, admin.id, reason);
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/storico');
  revalidatePath('/saldi');
  revalidatePath('/');
  return {};
}

const guestSchema = z.object({
  unclaimedTripId: z.string().min(1),
  nome: z.string().trim().min(1).max(40),
});

/**
 * «Questi km li ha fatti papà.» L'ospite non è un utente dell'app: non entra e non
 * divide i costi, ma i suoi chilometri devono esistere o il contachilometri non torna.
 */
export async function assignUnclaimedToGuestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireUser();
  const parsed = guestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Serve il nome di chi ha guidato' };

  try {
    const guestId = resolveGuest(parsed.data.nome);
    assignUnclaimedToNonBillable(parsed.data.unclaimedTripId, guestId, me.id);
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/reclami');
  revalidatePath('/saldi');
  revalidatePath('/');
  return {};
}

/* --------------------------------- scadenze --------------------------------- */

const deadlineSchema = z.object({
  vehicleId: z.string().min(1),
  type: z.enum(['assicurazione', 'bollo', 'revisione', 'tagliando']),
  dueDate: z.string().optional(),
  dueOdometerKm: optionalDecimal,
  notifyDaysBefore: z.coerce.number().int().positive().max(365).default(15),
});

export async function createDeadlineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireUser();
  const parsed = deadlineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Dati della scadenza non validi' };

  try {
    createDeadline(
      {
        vehicleId: parsed.data.vehicleId,
        type: parsed.data.type,
        dueDate: parseDay(parsed.data.dueDate),
        dueOdometerKm: parsed.data.dueOdometerKm,
        notifyDaysBefore: parsed.data.notifyDaysBefore,
      },
      me.id,
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/scadenze');
  redirect('/scadenze');
}

export async function completeDeadlineAction(_prev: ActionState, formData: FormData) {
  const me = await requireUser();
  try {
    completeDeadline(String(formData.get('deadlineId') ?? ''), me.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/scadenze');
  return {};
}

/* -------------------------------- notifiche --------------------------------- */

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function subscribeToPushAction(subscription: unknown): Promise<ActionState> {
  const me = await requireUser();
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { error: 'Iscrizione alle notifiche non valida' };

  saveSubscription(me.id, parsed.data);
  return {};
}

export async function unsubscribeFromPushAction(endpoint: string): Promise<ActionState> {
  await requireUser();
  removeSubscription(endpoint);
  return {};
}

/* ---------------------------------- inviti ---------------------------------- */

export async function createInviteAction(): Promise<{ url: string }> {
  const admin = await requireAdmin();
  const { token } = createInvite(admin.id);
  return { url: `${getEnv().APP_URL}/invito/${token}` };
}

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2, 'Serve un nome'),
  email: z.string().trim().email('Email non valida'),
  password: z.string().min(10, 'La password deve avere almeno 10 caratteri'),
});

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = acceptInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await acceptInvite(parsed.data);
  } catch (error) {
    return fail(error);
  }

  redirect('/login?registrato=1');
}
