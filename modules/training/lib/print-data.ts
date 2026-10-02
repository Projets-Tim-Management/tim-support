import type { Payload } from "payload";

import { readPassword } from "@/modules/marketing/lib/credential-secrets";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { memoGestures, type MemoGesture, type Programme } from "@/modules/training/lib/kit";
import { sessionTitle, sessionsOfDay, sortDays, type PlanDay, type PlanSession } from "@/modules/training/lib/plan";
import { GUIDE_URL } from "@/modules/training/lib/training";
import { PROFILS } from "@/modules/partner/lib/pricing";

/**
 * Données des documents imprimés d'une formation (étiquettes, fiches par rôle,
 * kit) — lues une fois, côté serveur, en accès système : les pages qui les
 * appellent vérifient elles-mêmes qui a le droit de les voir.
 */

type Doc = Record<string, unknown> & { id: number | string };

export type PrintPerson = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profile: string | null;
  /** Déchiffré seulement si demandé (TIM). */
  password: string | null;
};

export type PrintData = {
  companyName: string;
  /** Remise des accès par défaut de la formation. */
  defaultDelivery: string;
  days: (PlanDay & Doc)[];
  /** Créneaux non annulés, dans l'ordre du déroulé. */
  sessions: (PlanSession & Doc)[];
  people: PrintPerson[];
  programmes: Programme[];
  /** Premiers gestes par profil (premier module de son programme). */
  gestures: Record<string, MemoGesture[]>;
  site: string;
};

export async function loadTrainingPrint(
  payload: Payload,
  trainingId: number | string,
  opts: {
    withPasswords: boolean;
    dayId?: number | string | null;
    /** Tous les contacts du client, et pas seulement les personnes formées. */
    allContacts?: boolean;
  },
): Promise<PrintData | null> {
  const training = (await payload
    .findByID({ collection: "trainings", id: trainingId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Doc | null;
  if (!training) return null;
  const clientId = trainingRefId(training.client);
  const [client, daysRes, sessionsRes, settings] = await Promise.all([
    clientId != null ? payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true }).catch(() => null) : null,
    payload.find({ collection: "training-days", where: { training: { equals: trainingId } }, depth: 0, limit: 100, overrideAccess: true }),
    payload.find({ collection: "training-sessions", where: { training: { equals: trainingId } }, depth: 0, limit: 300, overrideAccess: true }),
    payload.findGlobal({ slug: "training-settings", depth: 0, overrideAccess: true }).catch(() => null),
  ]);
  const days = sortDays(daysRes.docs as unknown as (PlanDay & Doc)[]).filter(
    (d) => opts.dayId == null || String(d.id) === String(opts.dayId),
  );
  const all = (sessionsRes.docs as unknown as (PlanSession & Doc)[]).map((s) => ({ ...s, day: trainingRefId(s.day) as number | string }));
  const sessions = days.flatMap((d) => sessionsOfDay(all, d.id).filter((s) => s.status !== "annulee"));

  // Les personnes formées : participants des créneaux retenus, lus en BRUT
  // (l'API masque les mots de passe), déchiffrés pour TIM seulement.
  const ids = [...new Set(sessions.flatMap((s) => (s.participants ?? []).map(String)))];
  const where = opts.allContacts ? (clientId != null ? { client: { equals: clientId } } : null) : ids.length ? { id: { in: ids } } : null;
  const raw = where
    ? ((await payload.db.find({
        collection: "client-contacts",
        where,
        limit: opts.allContacts ? 1000 : ids.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as { docs?: Doc[] })
    : { docs: [] };
  const people: PrintPerson[] = (raw.docs ?? []).map((c) => ({
    id: String(c.id),
    firstName: (c.firstName as string) ?? null,
    lastName: (c.lastName as string) ?? null,
    email: (c.email as string) ?? null,
    profile: (c.licenceProfile as string) ?? null,
    password: opts.withPasswords ? readPassword(c.timPassword as string | null) : null,
  }));

  const programmes = ((settings as { programmes?: Programme[] } | null)?.programmes ?? []) as Programme[];
  // Tous les profils, formés ou non : une fiche « Chef de chantier » doit
  // pouvoir s'imprimer même si aucun créneau ne forme ce profil.
  const profiles = PROFILS.map((p) => p.key as string);
  const firstParcours = profiles
    .map((p) => [p, programmes.find((x) => x.profile === p)?.modules?.[0]?.parcours] as const)
    .filter(([, id]) => id != null);
  const parcoursRes = firstParcours.length
    ? await payload.find({
        collection: "parcours",
        where: { id: { in: firstParcours.map(([, id]) => id as number | string) } },
        depth: 1,
        limit: 20,
        overrideAccess: true,
      })
    : { docs: [] };
  const byId = new Map((parcoursRes.docs as unknown as Doc[]).map((p) => [String(p.id), p]));
  // Adresse publique du guide : ces liens s'impriment (voir GUIDE_URL).
  const site = GUIDE_URL;
  const gestures: Record<string, MemoGesture[]> = {};
  for (const [profile, id] of firstParcours) {
    const steps =
      (byId.get(String(id))?.steps as
        | { title?: string; titleFeature?: string; shortDescription?: string; slug?: string }[]
        | undefined) ?? [];
    gestures[profile] = memoGestures(steps.filter((f) => f && typeof f === "object"), site);
  }

  return {
    companyName: ((client as { companyName?: string } | null)?.companyName ?? "") as string,
    defaultDelivery: (training.defaultAccessDelivery as string) || "formateur",
    days,
    sessions,
    people,
    programmes,
    gestures,
    site,
  };
}

/**
 * Qui peut imprimer les documents d'une formation : TIM, ou le formateur d'une
 * de ses journées. Les mots de passe restent réservés à TIM (aux pages de le
 * respecter).
 */
export async function canPrintTraining(
  payload: Payload,
  user: { id: number | string } | null,
  trainingId: number | string,
  isAdmin: boolean,
): Promise<boolean> {
  if (!user) return false;
  if (isAdmin) return true;
  const mine = await payload.count({
    collection: "training-days",
    where: { and: [{ training: { equals: trainingId } }, { trainer: { equals: user.id } }] },
    overrideAccess: true,
  });
  return mine.totalDocs > 0;
}

/** Les créneaux d'un profil, au format des fiches de rôle. */
export function slotsForProfile(data: PrintData, profile: string) {
  return data.sessions
    .filter((s) => (s.profiles ?? []).includes(profile))
    .map((s) => ({
      date: (data.days.find((d) => String(d.id) === String(s.day))?.date as string | null) ?? null,
      start: s.startTime ?? null,
      end: s.endTime ?? null,
      title: sessionTitle(s.profiles),
    }));
}
