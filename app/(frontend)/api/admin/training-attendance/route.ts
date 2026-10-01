import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { TRAINING_STATUS_CHANGE } from "@/modules/training/collections/TrainingSessions";
import { canSignOn, type PlanSession } from "@/modules/training/lib/plan";

/**
 * Émarger une séance de formation : cocher les présents. C'est le GESTE qui
 * valide la séance (règle « validation = geste réel ») — pas une case à part.
 *
 * POST { sessionId, attendance: [contactId…] }  → séance « Réalisée »
 * POST { sessionId, attendance: null }           → émargement annulé (TIM)
 *
 * Qui : TIM, ou le formateur de la journée (un partenaire peut l'être).
 * Quand : à partir du jour de la séance (heure de Paris), jamais avant.
 *
 * La formation suit (TrainingSessions) : « Terminée » quand toutes les séances
 * non annulées sont réalisées ; annuler un émargement la rouvre.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    sessionId?: number | string;
    attendance?: (number | string)[] | null;
  } | null;
  if (!body?.sessionId || (body.attendance !== null && !Array.isArray(body.attendance))) {
    return NextResponse.json({ error: "Requête incomplète." }, { status: 400 });
  }

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const session = (await payload
    .findByID({ collection: "training-sessions", id: body.sessionId, depth: 0, overrideAccess: true })
    .catch(() => null)) as (PlanSession & { training?: unknown; day?: unknown }) | null;
  if (!session) return NextResponse.json({ error: "Séance introuvable." }, { status: 404 });
  const day = (await payload
    .findByID({ collection: "training-days", id: trainingRefId(session.day) as number | string, depth: 0, overrideAccess: true })
    .catch(() => null)) as { date?: string | null; trainer?: unknown; training?: unknown } | null;
  if (!day) return NextResponse.json({ error: "Journée introuvable." }, { status: 404 });

  const admin = hasAdminRole(user);
  const isTrainer = String(trainingRefId(day.trainer)) === String(user.id);
  if (!admin && !isTrainer) {
    return NextResponse.json({ error: "Seuls TIM et le formateur de la journée émargent." }, { status: 403 });
  }
  if (body.attendance === null && !admin) {
    return NextResponse.json({ error: "Seul TIM annule un émargement." }, { status: 403 });
  }
  if (session.status === "annulee") return NextResponse.json({ error: "Ce créneau est annulé." }, { status: 422 });
  const parent = (await payload
    .findByID({ collection: "trainings", id: trainingRefId(day.training) as number | string, depth: 0, overrideAccess: true })
    .catch(() => null)) as { status?: string } | null;
  if (parent?.status === "annule") return NextResponse.json({ error: "Cette formation est annulée." }, { status: 422 });
  if (!canSignOn(day.date, Date.now())) {
    return NextResponse.json({ error: "Une séance s'émarge à partir de son jour, pas avant." }, { status: 422 });
  }

  const signed = body.attendance !== null;
  if (signed && body.attendance!.length === 0) {
    return NextResponse.json({ error: "Personne n'est venu ? Annulez plutôt le créneau." }, { status: 422 });
  }
  // La synchronisation de la formation (TrainingSessions) dépose ici ce
  // qu'elle a fait : « termine », « ouvert », ou « refuse » (réouverture
  // impossible : une autre formation est ouverte pour ce client).
  const context: Record<string, unknown> = {};
  try {
    await payload.update({
      collection: "training-sessions",
      id: body.sessionId,
      data: (signed
        ? {
            attendance: body.attendance,
            status: "realisee",
            attendanceAt: new Date().toISOString(),
            attendanceBy: user.id,
          }
        : { attendance: [], status: "planifiee", attendanceAt: null, attendanceBy: null }) as never,
      overrideAccess: true,
      context,
    });
  } catch (err) {
    // Les gardes de la collection (présent hors participants, autre client) parlent d'elles-mêmes.
    return NextResponse.json({ error: (err as Error).message || "L'émargement n'a pas pu être enregistré." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, trainingChange: (context[TRAINING_STATUS_CHANGE] as string | undefined) ?? null });
}
