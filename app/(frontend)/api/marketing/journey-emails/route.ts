import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import {
  croiserEnvois,
  evenementsOrphelins,
  ordonnerEnvois,
  type EnvoiPrevu,
} from "@/modules/marketing/lib/journey-mail-status";
import type { SendFacts } from "@/modules/marketing/lib/due-emails";
import { getEmailActivity, journeyTag } from "@/modules/support/lib/brevo";

/**
 * GET /api/marketing/journey-emails?run=<id>
 *
 * Ce que le parcours a prévu, face à ce que Brevo a réellement fait de chaque
 * message : remis, ouvert, cliqué, rejeté.
 *
 * La lecture Brevo se fait CÔTÉ SERVEUR, jamais depuis le navigateur : la clé
 * API ne doit pas transiter par le client (même règle que l'onglet des tickets).
 *
 * Visible par l'admin et par le partenaire PROPRIÉTAIRE du parcours — c'est lui
 * qu'on appelle quand un client dit n'avoir rien reçu.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("run");
  if (!runId) return NextResponse.json({ error: "missing_run" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as
    | {
        id: number | string;
        partner?: unknown;
        client?: unknown;
        emails?: EnvoiPrevu[];
        sessionAt?: string | null;
      }
    | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const runPartner =
    run.partner && typeof run.partner === "object"
      ? ((run.partner as { id?: unknown }).id ?? null)
      : (run.partner ?? null);
  const sien = isPartnerMetier(user) && String(partnerIdOf(user) ?? "") === String(runPartner ?? "");
  if (!hasAdminRole(user) && !sien) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // L'adresse du parcours : celle du compte espace client, à défaut la fiche.
  const clientId =
    run.client && typeof run.client === "object"
      ? ((run.client as { id?: unknown }).id ?? null)
      : (run.client ?? null);

  const [compte, fiche] = await Promise.all([
    clientId == null
      ? null
      : payload
          .find({
            collection: "client-portal-accounts",
            where: { client: { equals: clientId } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          .then((r) => (r.docs[0] as { email?: string } | undefined) ?? null)
          .catch(() => null),
    clientId == null
      ? null
      : payload
          .findByID({ collection: "partner-clients", id: String(clientId), depth: 0, overrideAccess: true })
          .then((d) => d as { email?: string; onboardingStatus?: string } | null)
          .catch(() => null),
  ]);
  const adresse = compte?.email ?? fiche?.email ?? null;

  /**
   * Les MÊMES faits que ceux du cron : une relance déjà satisfaite ne doit pas
   * s'annoncer comme à venir. Le compte des accès n'en fait pas partie —
   * « acces-prets » est retenu, pas annulé, et l'écran doit continuer à le
   * signaler comme manquant (voir RAISON_SANS_OBJET).
   */
  const faits: SendFacts = {
    sessionAt: (run as { sessionAt?: string | null }).sessionAt ?? null,
    onboardingStatus: fiche?.onboardingStatus ?? null,
  };

  const activite = await getEmailActivity(journeyTag(run.id), adresse);

  // Le tag pour les envois récents, l'adresse pour les plus anciens : les
  // parcours en cours ont déjà reçu des messages d'avant le marquage.
  const evenements = [...activite.events, ...activite.otherToAddress];
  const prevus = Array.isArray(run.emails) ? run.emails : [];

  return NextResponse.json({
    configured: activite.configured,
    error: activite.error ?? null,
    adresse,
    envois: ordonnerEnvois(croiserEnvois(prevus, evenements, Date.now(), faits)),
    autres: evenementsOrphelins(prevus, evenements),
  });
}
