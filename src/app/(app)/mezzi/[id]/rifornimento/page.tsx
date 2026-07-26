import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { RefuelForm } from '@/components/refuel-form';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { getVehicle } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

export default async function RefuelPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const vehicle = getVehicle(id);
  if (!vehicle) notFound();

  // Anche gli utenti non fatturabili possono figurare come pagatori: capita
  // che il pieno lo metta la nonna o papà.
  const payers = db
    .select()
    .from(userTable)
    .where(eq(userTable.active, true))
    .all()
    .map((u) => ({ id: u.id, name: u.name, billable: u.billable }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Rifornimento · {vehicle.name}</h1>
      <RefuelForm
        vehicleId={vehicle.id}
        currentOdometerKm={vehicle.currentOdometerKm}
        payers={payers}
        meId={me.id}
      />
    </div>
  );
}
