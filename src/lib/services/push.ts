import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/** Le notifiche sono un di più: senza chiavi VAPID l'app funziona identica, in silenzio. */
export function pushEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function publicVapidKey(): string | null {
  return getEnv().VAPID_PUBLIC_KEY ?? null;
}

let configured = false;
function configure(): boolean {
  if (!pushEnabled()) return false;
  if (!configured) {
    const env = getEnv();
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): void {
  db.insert(pushSubscriptions)
    .values({
      id: randomUUID(),
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      // Stesso dispositivo che si ri-iscrive: si aggiorna, non si duplica.
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        failedAt: null,
      },
    })
    .run();
}

export function removeSubscription(endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export function hasSubscription(userId: string): boolean {
  return Boolean(
    db
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.failedAt)))
      .get(),
  );
}

/**
 * Manda una notifica a un gruppo di utenti. Non lancia mai: una notifica che non parte
 * non deve far fallire la registrazione di una corsa.
 */
export async function notify(userIds: readonly string[], message: PushMessage): Promise<number> {
  const targets = [...new Set(userIds)];
  if (targets.length === 0 || !configure()) return 0;

  const subscriptions = db
    .select()
    .from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, targets), isNull(pushSubscriptions.failedAt)))
    .all();

  const payload = JSON.stringify(message);
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        // 404/410 = il browser ha buttato la subscription: si marca e si smette di provarci.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.update(pushSubscriptions)
            .set({ failedAt: new Date() })
            .where(eq(pushSubscriptions.id, subscription.id))
            .run();
        }
      }
    }),
  );

  return sent;
}
