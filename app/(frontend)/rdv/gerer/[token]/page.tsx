import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BookingWidget from "@/components/booking/BookingWidget";
import ManageBooking from "@/components/booking/ManageBooking";
import { payloadClient } from "@/core/payload-client";
import { LOCATION_KINDS } from "@/modules/booking/lib/constants";
import { bookingByToken, canChange, locationOf } from "@/modules/booking/lib/engine";

/**
 * /rdv/gerer/<jeton> — le lien des e-mails : le rendez-vous, et de quoi le déplacer (nouveau créneau) ou l'annuler
 * (avec un mot), tant que les règles du type le permettent.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Votre rendez-vous — TIM Management", robots: { index: false } };

const PARIS = { timeZone: "Europe/Paris" } as const;

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await payloadClient();
  const found = await bookingByToken(payload, token);
  if (!found) notFound();
  const { booking: b, type: t } = found;
  const now = new Date();
  const moveRefused = canChange(t, b, "deplacer", now);
  const cancelRefused = canChange(t, b, "annuler", now);
  const when = `${new Date(String(b.start)).toLocaleDateString("fr-FR", { ...PARIS, weekday: "long", day: "numeric", month: "long" })} à ${new Date(String(b.start)).toLocaleTimeString("fr-FR", { ...PARIS, hour: "2-digit", minute: "2-digit" })}`;
  const where = LOCATION_KINDS.find((l) => l.value === locationOf(t, b))?.short ?? "Visio";
  return (
    <main className="min-h-screen bg-surface px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-muted">TIM Management</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.name}</h1>
        <p className="mt-2 text-lg capitalize text-foreground">{b.status === "annule" ? `Annulé — était prévu le ${when}` : when}</p>
        <p className="text-sm text-foreground/80">
          {t.durationMin} minutes · {where}
          {b.meetingUrl && b.status === "confirme" ? (
            <>
              {" · "}
              <a className="font-semibold text-primary underline" href={String(b.meetingUrl)} target="_blank" rel="noopener noreferrer">
                lien de la visio
              </a>
            </>
          ) : null}
        </p>
        {b.status !== "confirme" ? (
          <p className="mt-6 rounded-md bg-surface px-4 py-3 text-sm text-foreground">
            Ce rendez-vous n&apos;est plus actif.{" "}
            <a className="font-semibold text-primary underline" href={`/rdv/${t.slug}`}>
              En prendre un autre
            </a>
          </p>
        ) : (
          <div className="mt-8 space-y-10">
            {moveRefused ? (
              <p className="rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text">{moveRefused}</p>
            ) : (
              <section>
                <h2 className="mb-4 text-xl font-bold text-ink">Déplacer</h2>
                <BookingWidget slotsUrl={`/api/rdv/gerer/${token}`} postUrl={`/api/rdv/gerer/${token}`} durationMin={t.durationMin} locations={[{ value: locationOf(t, b), label: where }]} phoneRequired={false} questions={[]} prefill={{ answers: {} }} demande={null} tracking={{}} mode="deplacer" />
              </section>
            )}
            {!cancelRefused && <ManageBooking token={token} rebookUrl={`/rdv/${t.slug}`} />}
          </div>
        )}
      </div>
    </main>
  );
}
