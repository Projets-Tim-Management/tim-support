import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BookingCompact from "@/components/booking/BookingCompact";
import { payloadClient } from "@/core/payload-client";
import { locationMeta } from "@/modules/booking/lib/constants";
import { loadType } from "@/modules/booking/lib/engine";
import { prefillFromQuery, prefillFromSubmission, verifySubmissionRef } from "@/modules/booking/lib/prefill";

/**
 * /rdv/<type> — la page publique de réservation (comme Calendly) : qui reçoit, combien de temps, où, puis le
 * calendrier des créneaux et le formulaire. Pré-remplie par la demande d'origine (?demande=<référence signée>) ou par
 * l'adresse (?prenom=…&email=…). `?embed=1` : sans en-tête, pour la vitrine (iframe).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prendre rendez-vous — TIM Management", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TRACK: [string, string][] = [["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"], ["utm_term", "utmTerm"], ["utm_content", "utmContent"], ["gclid", "gclid"], ["msclkid", "msclkid"], ["fbclid", "fbclid"], ["oaiclid", "oaiclid"], ["ref", "referrer"]];

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const payload = await payloadClient();
  const t = await loadType(payload, slug);
  if (!t) notFound();
  const demande = verifySubmissionRef(one(q.demande));
  const fromQuery = prefillFromQuery(q, t.questions.map((x) => x.key));
  const fromDemande = demande ? await prefillFromSubmission(payload, demande) : null;
  const prefill = { ...fromQuery, ...Object.fromEntries(Object.entries(fromDemande ?? {}).filter(([, v]) => v)), answers: { ...fromQuery.answers, ...(fromDemande?.answers ?? {}) } };
  const tracking = Object.fromEntries(TRACK.flatMap(([k, to]) => (one(q[k]) ? [[to, String(one(q[k])).slice(0, 300)]] : [])));
  const embed = one(q.embed) === "1";

  // Ni le nom ni la photo de qui reçoit (16/11/2026) : c'est TIM Management — l'équipe commerciale va s'élargir.
  const locations = t.locations.map((value) => ({ value, label: locationMeta(value).title, hint: locationMeta(value).hint }));

  const booking = (
    <BookingCompact
      slotsUrl={`/api/rdv/${t.slug}`}
      postUrl={`/api/rdv/${t.slug}`}
      durationMin={t.durationMin}
      locations={locations}
      phoneRequired={t.phoneRequired}
      allRequiredInVisio={t.fromForm}
      simpleForm={t.simpleForm}
      questions={t.questions.map(({ key, label, type, options, required }) => ({ key, label, type, options, required }))}
      prefill={prefill}
      demande={demande ? String(one(q.demande)) : null}
      tracking={tracking}
    />
  );

  // Intégrée (?embed=1 : le bouton « Prendre rendez-vous » de la vitrine, une page) : les étapes seules.
  if (embed) return <main className="min-h-screen bg-white px-3 py-2">{booking}</main>;

  // Seule : une carte comme Calendly — ce que c'est à gauche, les étapes à droite ; l'une sous l'autre sur mobile.
  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-border bg-white shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <aside className="border-b border-border p-6 sm:p-8 md:border-b-0 md:border-r">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">TIM Management</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{t.name}</h1>
          <ul className="mt-5 space-y-3 text-foreground/85">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface" aria-hidden="true">⏱</span>
              <span className="font-semibold">{t.durationMin} minutes</span>
            </li>
            {locations.map((l) => (
              <li key={l.value} className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface" aria-hidden="true">
                  {l.value === "meet" ? "🎥" : l.value === "telephone" ? "📞" : "📍"}
                </span>
                <span>
                  <span className="block font-semibold">{l.label}</span>
                  {l.hint && <span className="block text-sm text-foreground/70">{l.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
          {t.description && <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-foreground/75">{t.description}</p>}
          <p className="mt-6 text-xs text-muted">Les horaires sont à l&apos;heure de Paris. Vous recevez la confirmation par e-mail, avec de quoi déplacer ou annuler.</p>
        </aside>
        <section className="p-4 sm:p-6">{booking}</section>
      </div>
    </main>
  );
}
