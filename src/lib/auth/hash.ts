import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id con i parametri raccomandati da OWASP (19 MiB, 2 iterazioni).
 * L'app è esposta su internet: le password non si hashano con qualcosa di più veloce.
 *
 * `2` è `Algorithm.Argon2id`: l'enum del pacchetto è un ambient const enum e non si
 * può importare con `isolatedModules` attivo.
 */
const OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(data.hash, data.password, OPTIONS);
  } catch {
    // Hash malformato o di un altro algoritmo: non è una password valida, punto.
    return false;
  }
}
