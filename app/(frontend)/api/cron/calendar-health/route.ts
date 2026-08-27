import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { accessTokenFor } from "@/modules/marketing/lib/calendar";
import { adminEmails } from "@/modules/marketing/lib/notify";

/**
 * Contrôle quotidien des agendas connectés.
 *
 * POURQUOI. Un jeton d'agenda expire en silence. Le jour où un client réserve,
 * aucun événement n'est créé, aucun lien de visio n'existe — et personne ne
 * l'apprend avant le rendez-vous, souvent le client lui-même. Ce cron force le
 * rafraîchissement AVANT que ça n'arrive : une connexion qui peut être renouvelée
 * l'est ici, tranquillement ; une connexion vraiment morte est signalée à
 * l'équipe pendant qu'il reste du temps pour la reconnecter.
 *
 * Il alerte aussi sur les RENDEZ-VOUS EN VISIO SANS LIEN à venir, quelle qu'en
 * soit la cause : c'est le symptôme qui compte pour le client.
 *
 * `dry=1` : contrôle et diagnostic, sans e-mail.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Connection = {
  id: number | string;
  provider: string;
  accountEmail?: string | null;
  status?: string | null;
  partner?: number | string | null;
  calendars?: { calendarId?: string; target?: boolean }[];
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const payload = await payloadClient();

  const connections = (
    await payload.find({
      collection: "calendar-connections",
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as Connection[];

  const checked: {
    id: number | string;
    provider: string;
    account?: string | null;
    before?: string | null;
    target: boolean;
    usable: boolean;
  }[] = [];

  for (const c of connections) {
    const before = c.status ?? null;
    // Un simple appel suffit à tester : `accessTokenFor` rafraîchit si besoin,
    // remet le statut à « ok » quand ça marche, et le marque expiré sinon.
    const token = await accessTokenFor(payload, c as never);
    checked.push({
      id: c.id,
      provider: c.provider,
      account: c.accountEmail ?? null,
      before,
      target: (c.calendars ?? []).some((cal) => cal.target && cal.calendarId),
      usable: Boolean(token),
    });
  }

  // Rendez-vous À VENIR annoncés en visio sans lien : le symptôme visible par
  // le client, quelle que soit la raison technique.
  const runs = (
    await payload.find({
      collection: "journey-runs",
      where: {
        and: [
          { sessionAt: { greater_than: new Date().toISOString() } },
          { sessionMode: { not_equals: "sur-place" } },
        ],
      },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as { id: number | string; sessionAt?: string; sessionLink?: string | null; displayName?: string }[];

  const sessionsSansLien = runs
    .filter((r) => !r.sessionLink?.trim())
    .map((r) => `${r.displayName ?? `parcours ${r.id}`} — ${r.sessionAt}`);

  const cassees = checked.filter((c) => c.target && !c.usable);
  const retablies = checked.filter((c) => c.before === "expired" && c.usable);

  // On n'alerte que s'il y a matière : une connexion morte, ou un rendez-vous
  // qui arrive sans lien. Un rapport quotidien « tout va bien » ne se lit pas.
  if (!dry && (cassees.length || sessionsSansLien.length)) {
    const to = await adminEmails(payload);
    if (to.length) {
      const lignes = [
        cassees.length ? "AGENDAS À RECONNECTER" : null,
        ...cassees.map((c) => `• ${c.provider} — ${c.account ?? `connexion ${c.id}`}`),
        cassees.length ? "" : null,
        sessionsSansLien.length ? "RENDEZ-VOUS EN VISIO SANS LIEN" : null,
        ...sessionsSansLien.map((s) => `• ${s}`),
      ].filter((l) => l !== null) as string[];

      await payload
        .sendEmail({
          to: to.join(","),
          subject: cassees.length
            ? `Agenda à reconnecter — ${cassees.length} connexion(s)`
            : `${sessionsSansLien.length} rendez-vous en visio sans lien`,
          text: lignes.join("\n"),
        })
        .catch((e) => payload.logger.error(`[agenda] alerte de santé non envoyée : ${e}`));
    }
  }

  payload.logger.info(
    `[cron] santé des agendas : ${checked.length} connexion(s), ${retablies.length} rétablie(s), ` +
      `${cassees.length} à reconnecter, ${sessionsSansLien.length} rendez-vous sans lien${dry ? " (à blanc)" : ""}.`,
  );

  return NextResponse.json({
    ok: true,
    dry,
    connections: checked,
    retablies: retablies.length,
    aReconnecter: cassees.length,
    sessionsSansLien,
  });
}
