import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { PROFILS } from "@/modules/partner/lib/pricing";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { timedProgramme } from "@/modules/training/lib/kit";
import { contactName, profileLabel, sessionTitle } from "@/modules/training/lib/plan";
import { loadTrainingPrint, slotsForProfile, type PrintPerson } from "@/modules/training/lib/print-data";
import { CredentialsTable } from "@/modules/training/print/CredentialsTable";
import { RoleSheet } from "@/modules/training/print/RoleSheet";

import PrintNow from "../acces/PrintNow";

/**
 * Le KIT d'une journée de formation, à imprimer — ouvert depuis le plan.
 *
 * Pour chaque créneau : le programme horodaté, la feuille de présence, puis les
 * fiches d'identifiants des participants (si c'est le formateur qui les
 * remet). En fin de kit : une fiche de rôle par profil formé, à distribuer.
 *
 * Pour TIM et le formateur de la journée. Les mots de passe ne s'impriment que
 * pour TIM (même règle que la feuille d'accès) : un formateur partenaire a le
 * kit sans les fiches, et le sait.
 */
export const dynamic = "force-dynamic";

type Doc = Record<string, unknown> & { id: number | string };

const frDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const frHour = (hhmm?: string | null) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}`;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day: dayId } = await searchParams;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) return <p className="p-10 text-muted">Connectez-vous au back-office pour imprimer le kit.</p>;
  if (!dayId) return <p className="p-10 text-muted">Aucune journée indiquée.</p>;

  const day = (await payload.findByID({ collection: "training-days", id: dayId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null;
  if (!day) return <p className="p-10 text-muted">Journée introuvable.</p>;
  const admin = hasAdminRole(user);
  if (!admin && String(trainingRefId(day.trainer)) !== String(user.id)) {
    return <p className="p-10 text-muted">Kit réservé à l&apos;équipe TIM et au formateur de la journée.</p>;
  }

  // Les mêmes données que les étiquettes et les fiches par rôle (mots de
  // passe déchiffrés pour TIM seulement).
  const data = await loadTrainingPrint(payload, trainingRefId(day.training) as number | string, {
    withPasswords: admin,
    dayId: day.id,
  });
  if (!data) return <p className="p-10 text-muted">Formation introuvable.</p>;
  const { companyName, defaultDelivery, sessions, programmes } = data;
  const people = new Map(data.people.map((p) => [p.id, p]));
  const profiles = PROFILS.map((p) => p.key as string).filter((k) => sessions.some((s) => (s.profiles ?? []).includes(k)));

  const place =
    day.mode === "distance"
      ? `En visio${day.link ? ` — ${day.link as string}` : ""}`
      : ((day.location as string) || "Lieu à confirmer");

  return (
    <div className="px-8 py-10 text-foreground print:px-0 print:py-0">
      <PrintNow />

      {sessions.length === 0 && <p className="text-muted">Aucun créneau dans cette journée.</p>}

      {sessions.map((s, i) => {
        const attendees = (s.participants ?? []).map((id) => people.get(String(id))).filter(Boolean) as PrintPerson[];
        const prog = timedProgramme(programmes, s.profiles ?? [], s.startTime, s.endTime);
        const byTrainer = (s.accessDelivery || defaultDelivery) === "formateur";
        const head = (
          // Pas de <header> : la feuille d'impression du site masque toutes ces
          // balises (pour retirer le bandeau du site) — l'en-tête disparaîtrait.
          <div className="mb-6">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {companyName} · {day.date ? frDay(day.date as string) : "date à fixer"}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {sessionTitle(s.profiles)}
              {s.startTime ? ` — ${frHour(s.startTime)}${s.endTime ? ` à ${frHour(s.endTime)}` : ""}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {place}
              {day.locationDetails ? ` · ${String(day.locationDetails).replace(/\n/g, " · ")}` : ""}
              {day.trainerName ? ` · Formateur : ${day.trainerName as string}` : ""}
            </p>
          </div>
        );
        return (
          <div key={String(s.id)} className={i > 0 ? "break-before-page pt-10 print:pt-0" : ""}>
            {/* 1. Programme */}
            {head}
            <h2 className="mb-3 text-lg font-semibold">Programme</h2>
            {prog.modules.length ? (
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {prog.modules.map((m) => (
                    <tr key={m.title} className="border-b border-border">
                      <td className="w-32 py-2 font-mono text-muted">
                        {m.start ? `${m.start} – ${m.end}` : `${m.minutes} min`}
                      </td>
                      <td className="py-2">{m.title}</td>
                      <td className="w-40 py-2 text-right text-xs text-muted">{profileLabel(m.profile)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">Pas de programme type pour ces profils (Système → Formation).</p>
            )}
            {prog.overflow > 0 && (
              <p className="mt-3 text-sm font-semibold text-primary">
                Le programme dépasse le créneau de {prog.overflow} min : à resserrer pendant la séance.
              </p>
            )}

            {/* 2. Feuille de présence */}
            <div className="break-before-page pt-10 print:pt-0">
              {head}
              <h2 className="mb-1 text-lg font-semibold">Feuille de présence</h2>
              <p className="mb-4 text-sm text-muted">À reporter ensuite dans le plan (« Émarger »).</p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground text-left">
                    <th className="py-2">Nom</th>
                    <th className="py-2">Profil</th>
                    <th className="w-56 py-2">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((c) => (
                    <tr key={c.id} className="h-12 border-b border-border">
                      <td>{contactName(c)}</td>
                      <td className="text-muted">{profileLabel(c.profile)}</td>
                      <td />
                    </tr>
                  ))}
                  {/* Deux lignes libres : il y a toujours quelqu'un de prévu au dernier moment. */}
                  {[0, 1].map((k) => (
                    <tr key={`libre-${k}`} className="h-12 border-b border-border">
                      <td />
                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 3. Fiches d'identifiants */}
            {byTrainer && (
              <div className="break-before-page pt-10 print:pt-0">
                {head}
                <h2 className="mb-1 text-lg font-semibold">Identifiants à remettre</h2>
                {!admin ? (
                  <p className="text-sm text-muted">
                    Les mots de passe ne s&apos;impriment que depuis un compte TIM : demandez les identifiants à l&apos;équipe TIM.
                  </p>
                ) : (
                  <div className="mt-4">
                    <CredentialsTable people={attendees} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 4. Une fiche de rôle par profil formé ce jour-là (la même que
          « Fiches par rôle ») : à distribuer en fin de séance. */}
      {profiles.map((p) => (
        <RoleSheet
          key={p}
          profile={p}
          companyName={companyName}
          modules={programmes.find((x) => x.profile === p)?.modules ?? []}
          slots={slotsForProfile(data, p)}
          gestures={data.gestures[p] ?? []}
          site={data.site}
        />
      ))}
    </div>
  );
}
