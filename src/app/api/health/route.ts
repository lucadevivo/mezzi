import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Usato dall'healthcheck di Docker: se il DB non risponde, il container è malato. */
export async function GET() {
  try {
    db.get(sql`select 1`);
    return Response.json({ status: 'ok' });
  } catch (error) {
    return Response.json(
      { status: 'error', message: error instanceof Error ? error.message : 'unknown' },
      { status: 503 },
    );
  }
}
