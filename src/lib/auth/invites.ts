import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { account, invites, user } from '@/lib/db/schema';
import { hashPassword } from './hash';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** In DB finisce solo l'hash: il token in chiaro vive nel link e basta. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createInvite(createdByUserId: string, now = new Date()) {
  const token = randomBytes(32).toString('base64url');

  db.insert(invites)
    .values({
      id: randomUUID(),
      tokenHash: hashToken(token),
      createdByUserId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .run();

  return { token, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) };
}

export function findValidInvite(token: string, now = new Date()) {
  const invite = db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt)))
    .get();

  if (!invite || invite.expiresAt.getTime() < now.getTime()) return null;
  return invite;
}

export class InviteError extends Error {}

/**
 * Consuma l'invito e crea l'utente con le sue credenziali.
 * Il record `account` è quello che Better Auth si aspetta per il login email/password.
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  email: string;
  password: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const invite = findValidInvite(input.token, now);
  if (!invite) throw new InviteError('Invito non valido o già usato');

  const email = input.email.trim().toLowerCase();
  if (db.select().from(user).where(eq(user.email, email)).get()) {
    throw new InviteError('Esiste già un utente con questa email');
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();

  db.transaction((tx) => {
    tx.insert(user).values({ id: userId, name: input.name.trim(), email, role: 'member' }).run();

    tx.insert(account)
      .values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: passwordHash,
      })
      .run();

    tx.update(invites)
      .set({ usedAt: now, usedByUserId: userId })
      .where(eq(invites.id, invite.id))
      .run();
  });

  return { userId };
}
