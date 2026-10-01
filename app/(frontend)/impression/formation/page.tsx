import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { SITE_URL } from "@/core/lib/email-template";
import { payloadClient } from "@/core/payload-client";
import { readPassword } from "@/modules/marketing/lib/credential-secrets";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { memoGestures, printableUrl, timedProgramme, type Programme } from "@/modules/training/lib/kit";
import { contactName, profileLabel, sessionTitle, sessionsOfDay, type PlanSession } from "@/modules/training/lib/plan";

import PrintNow from "../acces/PrintNow";

/**
 * Le KIT d'une journée de formation, à imprimer — ouvert depuis le plan.
 *
 * Pour chaque créneau : le programme horodaté, la feuille de présence, puis les
 * fiches d'identifiants des participants (si c'est le formateur qui les
 * remet). En fin de kit : un mémo « Bien démarrer » par profil formé, à
 * distribuer.
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

  const clientId = trainingRefId(day.client);
  const [client, training, sessionsRes, settings] = await Promise.all([
    clientId != null ? payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true }).catch(() => null) : null,
    payload.findByID({ collection: "trainings", id: trainingRefId(day.training) as number | string, depth: 0, overrideAccess: true }).catch(() => null),
    payload.find({ collection: "training-sessions", where: { day: { equals: dayId } }, depth: 0, limit: 100, overrideAccess: true }),
    payload.findGlobal({ slug: "training-settings", depth: 0, overrideAccess: true }).catch(() => null),
  ]);
  const companyName = (client as { companyName?: string } | null)?.companyName ?? "";
  const defaultDelivery = (training as { defaultAccessDelivery?: string } | null)?.defaultAccessDelivery ?? "formateur";
  const sessions = sessionsOfDay(
    (sessionsRes.docs as unknown as (PlanSession & Doc)[]).map((s) => ({ ...s, day: trainingRefId(s.day) as number | string })),
    day.id,
  ).filter((s) => s.status !== "annulee");
  const programmes = ((settings as { programmes?: Programme[] } | null)?.programmes ?? []) as Programme[];

  // Participants : contacts du client (avec les mots de passe pour TIM seulement).
  const contactsRes = clientId != null
    ? await payload.find({ collection: "client-contacts", where: { client: { equals: clientId } }, depth: 0, limit: 300, overrideAccess: true })
    : { docs: [] };
  const contacts = new Map((contactsRes.docs as unknown as Doc[]).map((c) => [String(c.id), c]));
  // Les mots de passe des PARTICIPANTS de la journée seulement, lus en brut
  // (l'API les masque) puis déchiffrés — pour TIM uniquement.
  const participantIds = [...new Set(sessions.flatMap((s) => (s.participants ?? []).map(String)))];
  const passwords = new Map<string, string | null>();
  if (admin && participantIds.length) {
    const raw = (await payload.db.find({
      collection: "client-contacts",
      where: { id: { in: participantIds } },
      limit: participantIds.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as { docs?: { id: number | string; timPassword?: string | null }[] };
    for (const c of raw.docs ?? []) passwords.set(String(c.id), readPassword(c.timPassword));
  }

  // Mémos : un par profil formé ce jour-là, gestes tirés du 1er module du programme.
  const profiles = [...new Set(sessions.flatMap((s) => s.profiles ?? []))];
  const parcoursIds = profiles.map((p) => programmes.find((x) => x.profile === p)?.modules?.[0]?.parcours).filter((v) => v != null);
  const parcoursRes = parcoursIds.length
    ? await payload.find({ collection: "parcours", where: { id: { in: parcoursIds as (number | string)[] } }, depth: 1, limit: 20, overrideAccess: true })
    : { docs: [] };
  const parcoursById = new Map((parcoursRes.docs as unknown as Doc[]).map((p) => [String(p.id), p]));
  const site = SITE_URL.replace(/\/$/, "");

  const place =
    day.mode === "distance"
      ? `En visio${day.link ? ` — ${day.link as string}` : ""}`
      : ((day.location as string) || "Lieu à confirmer");

  return (
    <div className="px-8 py-10 text-foreground print:px-0 print:py-0">
      <PrintNow />

      {sessions.length === 0 && <p className="text-muted">Aucun créneau dans cette journée.</p>}

      {sessions.map((s, i) => {
        const people = (s.participants ?? []).map((id) => contacts.get(String(id))).filter(Boolean) as Doc[];
        const prog = timedProgramme(programmes, s.profiles ?? [], s.startTime, s.endTime);
        const byTrainer = (s.accessDelivery || defaultDelivery) === "formateur";
        const head = (
          <header className="mb-6">
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
          </header>
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
                  {people.map((c) => (
                    <tr key={String(c.id)} className="h-12 border-b border-border">
                      <td>{contactName(c as never)}</td>
                      <td className="text-muted">{profileLabel(c.licenceProfile as string)}</td>
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
                    Les mots de passe ne s&apos;impriment que depuis un compte TIM : demandez les fiches à l&apos;équipe TIM.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {people.map((c) => (
                      <section key={String(c.id)} className="break-inside-avoid rounded-lg border border-border p-4">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-base font-semibold">{contactName(c as never)}</span>
                          <span className="text-sm text-muted">{profileLabel(c.licenceProfile as string)}</span>
                        </div>
                        <dl className="mt-3 flex flex-col gap-1 text-sm">
                          <div className="flex gap-2">
                            <dt className="w-28 shrink-0 text-muted">Identifiant</dt>
                            <dd className="font-mono">{(c.email as string) || "—"}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-28 shrink-0 text-muted">Mot de passe</dt>
                            <dd className="font-mono">{passwords.get(String(c.id)) || "pas encore généré"}</dd>
                          </div>
                        </dl>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 4. Mémos « Bien démarrer », un par profil */}
      {profiles.map((p) => {
        const first = programmes.find((x) => x.profile === p)?.modules?.[0];
        const parcours = first?.parcours != null ? parcoursById.get(String(first.parcours)) : undefined;
        const gestures = memoGestures(((parcours?.steps as { title?: string; slug?: string }[]) ?? []).filter((f) => typeof f === "object"), site);
        return (
          <div key={p} className="break-before-page pt-10 print:pt-0">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Mémo · {profileLabel(p)}</p>
            <h1 className="mt-1 mb-6 text-2xl font-bold">Bien démarrer avec TIM</h1>
            <ol className="flex flex-col gap-4 text-sm">
              <li>
                <strong>1. Installez l&apos;application TIM</strong> sur votre téléphone : App Store ou Google Play, cherchez « TIM ».
              </li>
              <li>
                <strong>2. Connectez-vous</strong> : votre identifiant est votre adresse e-mail, votre mot de passe vous a été remis.
              </li>
              <li>
                <strong>3. Mot de passe oublié ?</strong> Lien « Mot de passe oublié » sur l&apos;écran de connexion.
              </li>
              {gestures.length > 0 && (
                <li>
                  <strong>4. Vos premiers gestes</strong>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {gestures.map((g) => (
                      <li key={g.url} className="flex justify-between gap-4 border-b border-border pb-1.5">
                        <span>{g.title}</span>
                        <span className="font-mono text-xs text-muted">{printableUrl(g.url)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              <li>
                <strong>{gestures.length ? "5" : "4"}. Pour aller plus loin</strong> : tous les guides pas à pas sur{" "}
                <span className="font-mono">{printableUrl(`${site}/parcours`)}</span>
              </li>
            </ol>
          </div>
        );
      })}
    </div>
  );
}
