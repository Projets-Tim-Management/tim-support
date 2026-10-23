import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { computeCampaignStats } from "@/modules/marketing/lib/mass-email-stats";
import { getTaggedEvents } from "@/modules/support/lib/brevo";

/**
 * Campagnes d'e-mail de masse envoyées (onglet « Campagnes envoyées »).
 *
 * GET           → les 100 dernières campagnes (ce que la base sait : objet,
 *                 date, expéditeur, nombre d'envois)
 * GET ?id=…     → les statistiques de l'une d'elles, lues chez Brevo par son
 *                 tag : délivrés, ouvertures, clics par lien, détail par personne
 *
 * Les chiffres ne sont pas copiés en base : ils bougent pendant des jours (une
 * ouverture la semaine suivante), on les lit donc à chaque consultation.
 * Brevo garde 90 jours d'historique ; au-delà, seuls les envois restent.
 */
export const dynamic = "force-dynamic";

type Campaign = {
  id: number | string;
  subject?: string;
  sentAt?: string;
  tag?: string;
  fromEmail?: string;
  withSignature?: boolean;
  templateLabel?: string;
  sentCount?: number;
  suppressedCount?: number;
  failedCount?: number;
  recipients?: { email: string; status: string }[];
};

export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || !hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    const res = await payload
      .find({ collection: "mass-email-campaigns", sort: "-sentAt", limit: 100, depth: 0, overrideAccess: true })
      .catch(() => null);
    // La liste des destinataires reste côté serveur : elle ne sert qu'au détail.
    const campaigns = ((res?.docs ?? []) as Campaign[]).map((c) => ({ ...c, recipients: undefined }));
    return NextResponse.json({ campaigns });
  }

  const c = (await payload
    .findByID({ collection: "mass-email-campaigns", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as Campaign | null;
  if (!c?.tag) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sentTo = (c.recipients ?? []).filter((r) => r.status === "sent").map((r) => r.email);
  try {
    const events = await getTaggedEvents(c.tag);
    const ageDays = c.sentAt ? (Date.now() - Date.parse(c.sentAt)) / 86_400_000 : 0;
    return NextResponse.json({ stats: computeCampaignStats(events, sentTo), expired: ageDays > 90 });
  } catch (err) {
    payload.logger.error(`[e-mail de masse] statistiques de ${c.tag} illisibles : ${err}`);
    return NextResponse.json({ error: "Statistiques Brevo indisponibles pour le moment." }, { status: 502 });
  }
}
