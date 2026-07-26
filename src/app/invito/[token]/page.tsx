import { InviteForm } from '@/components/invite-form';
import { findValidInvite } from '@/lib/auth/invites';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = findValidInvite(token);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Benvenuto</h1>
      {invite ? (
        <>
          <p className="mb-6 text-ink-dim">Crea il tuo account per entrare nei conti dei mezzi.</p>
          <InviteForm token={token} />
        </>
      ) : (
        <p className="rounded-xl border border-debt/40 bg-debt/10 px-4 py-3 text-debt">
          Questo invito non è valido, è scaduto o è già stato usato. Chiedine uno nuovo all’admin.
        </p>
      )}
    </div>
  );
}
