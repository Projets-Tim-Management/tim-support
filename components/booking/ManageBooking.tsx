"use client";

import { useState } from "react";

/** Annuler un rendez-vous depuis le lien des e-mails, avec un mot facultatif (il revient à l'équipe). */
export default function ManageBooking({ token, rebookUrl }: { token: string; rebookUrl: string }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p className="rounded-md bg-surface px-4 py-3 text-sm text-foreground">
        Rendez-vous annulé : la confirmation part par e-mail.{" "}
        <a className="font-semibold text-primary underline" href={rebookUrl}>
          En reprendre un
        </a>
      </p>
    );
  }
  return (
    <section>
      {!open ? (
        <button type="button" className="text-sm font-semibold text-muted underline" onClick={() => setOpen(true)}>
          Annuler le rendez-vous
        </button>
      ) : (
        <div className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-ink">Annuler le rendez-vous</h2>
          <label className="mt-3 block">
            <span className="text-sm font-medium text-foreground">
              Un mot pour nous <span className="font-normal text-muted">(facultatif)</span>
            </span>
            <textarea className="mt-1 w-full rounded-md border border-border px-3 py-2" rows={3} maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} />
          </label>
          {error && <p className="mt-3 rounded-md bg-danger-bg px-4 py-3 text-sm">{error}</p>}
          <div className="mt-4 flex gap-4">
            <button
              type="button"
              disabled={busy}
              className="rounded-btn bg-primary px-5 py-2.5 font-semibold text-white disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await fetch(`/api/rdv/gerer/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "annuler", motif }) }).catch(() => null);
                setBusy(false);
                if (res?.ok) setDone(true);
                else setError(((await res?.json().catch(() => ({}))) as { message?: string } | undefined)?.message ?? "L'annulation n'a pas abouti. Réessayez.");
              }}
            >
              Confirmer l&apos;annulation
            </button>
            <button type="button" className="text-sm font-semibold text-muted" onClick={() => setOpen(false)}>
              Garder le rendez-vous
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
