import type { Payload } from "payload";

import { validatePhone } from "@/core/lib/validators";
import { normalizePhone } from "@/modules/forms/lib/to-opportunity";
import { formatSlot } from "@/modules/marketing/lib/scheduling";

/**
 * Un rendez-vous pris sur la page de présentation de la V2 devient du travail
 * commercial, là où l'équipe le regarde déjà : une fiche dans la liste des
 * prospects, et une TÂCHE « Réunion » datée du créneau, dans « À faire ».
 *
 * La personne est-elle déjà connue ? On cherche son adresse partout où un client
 * en laisse une — la fiche, ses contacts, son espace client. Connue : le
 * rendez-vous s'ajoute à SA fiche, sans doublon. Inconnue : une opportunité
 * « Nouvelle » est créée chez l'interlocuteur de la page, et peut
 * ensuite être rattachée à la main si c'était quelqu'un d'une entreprise
 * existante sous une autre adresse.
 */

type Person = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
};

type Ref = { id?: number | string } | number | string | null | undefined;
const idOf = (ref: Ref): number | string | null =>
  ref == null ? null : typeof ref === "object" ? (ref.id ?? null) : ref;

/** Fiche client déjà connue pour cette adresse, dans l'ordre de certitude. */
async function knownClient(payload: Payload, email: string): Promise<number | string | null> {
  const direct = await payload.find({
    collection: "partner-clients",
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (direct.docs[0]) return direct.docs[0].id;

  for (const collection of ["client-contacts", "client-portal-accounts"] as const) {
    const found = await payload
      .find({ collection, where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      .catch(() => null);
    const client = idOf((found?.docs[0] as { client?: Ref } | undefined)?.client);
    if (client != null) return client;
  }
  return null;
}

export async function leadFromBooking(
  payload: Payload,
  args: {
    at: string;
    person: Person;
    meetingUrl: string | null;
    /** Fiche partenaire de l'interlocuteur : un nouveau prospect lui est attribué. */
    hostId: number;
    /** Adresse de la page, pour la note du prospect. */
    path: string;
  },
): Promise<{ clientId: number | string; created: boolean } | null> {
  const { at, person: p, meetingUrl, hostId, path } = args;
  const email = (p.email ?? "").toLowerCase();
  const who = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const when = formatSlot(at);

  let clientId = email ? await knownClient(payload, email) : null;
  const created = clientId == null;

  if (clientId == null) {
    // L'interlocuteur de la page : c'est avec lui que le rendez-vous est pris,
    // c'est donc lui qui suit le prospect.
    const partner = hostId;
    const phone = normalizePhone(p.phone);
    const doc = await payload.create({
      collection: "partner-clients",
      data: {
        companyName: p.company ?? (email || "Rendez-vous V2"),
        email: email || undefined,
        phone: phone && validatePhone(phone) === true ? phone : undefined,
        partner: partner as never,
        // « Nouvelle », publiée d'office : voir create-opportunity — une fiche
        // en brouillon n'apparaît ni dans le Kanban ni dans les rappels.
        clientStatus: "nouvelle" as const,
        leadNotes: [
          `Rendez-vous « tour de l'app mobile V2 » réservé depuis ${path}.`,
          `Créneau : ${when}`,
          `Contact : ${who} — ${email}${p.phone ? ` — ${p.phone}` : ""}`,
          p.message ? `Message : ${p.message}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        _status: "published",
      } as never,
      overrideAccess: true,
    });
    clientId = doc.id;

    await payload
      .create({
        collection: "client-contacts",
        data: {
          client: clientId as never,
          firstName: p.firstName ?? undefined,
          lastName: p.lastName ?? undefined,
          email: email || undefined,
          phone: p.phone ?? undefined,
          role: "Rendez-vous app V2",
        },
        overrideAccess: true,
      })
      .catch((e) => payload.logger.error(`[app-v2] contact de ${clientId} non créé : ${e}`));
  }

  // La tâche : ce qui fait apparaître le rendez-vous dans « À faire », daté.
  await payload
    .create({
      collection: "client-activities",
      data: {
        client: clientId,
        type: "tache",
        taskKind: "reunion",
        title: `Tour de l'app V2 — ${who || p.company || email}`,
        dueDate: at,
        content: [
          `${when} · 20 min en visio`,
          meetingUrl ? `Visio : ${meetingUrl}` : "Lien de visio : à envoyer (l'événement d'agenda n'a pas pu être créé).",
          `Contact : ${who} — ${email}${p.phone ? ` — ${p.phone}` : ""}`,
          p.company ? `Société déclarée : ${p.company}` : "",
          p.message ? `Message : ${p.message}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      } as never,
      overrideAccess: true,
    })
    .catch((e) => payload.logger.error(`[app-v2] tâche du rendez-vous non créée sur ${clientId} : ${e}`));

  return { clientId, created };
}
