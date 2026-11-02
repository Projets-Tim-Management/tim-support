import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import {
  croiserEnvois,
  evenementsOrphelins,
  ordonnerEnvois,
  sortDesEvenements,
  type EnvoiPrevu,
  type EvenementBrevo,
} from "@/modules/marketing/lib/journey-mail-status";
import type { SendFacts } from "@/modules/marketing/lib/due-emails";
import { getEmailActivity, journeyTag } from "@/modules/support/lib/brevo";
import { baseEmailKey, PRODUCTION_EMAILS, PRODUCTION_KEY } from "@/modules/marketing/lib/journey";
import { productionRunOf } from "@/modules/marketing/lib/run-mail-log";
import { hasContractPhase } from "@/modules/partner/lib/clientStatus";
import { ASKS_TO_SIGN, signingAdvice } from "@/modules/partner/lib/signing-advice";

/** Un message reçu, résumé : son objet, sa date d'envoi, ce qu'il en est advenu. */
type Message = { subject: string; date: string; sort: string; clics: number };

const cle = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Les évènements Brevo regroupés par message (envoyé, remis, ouvert… ne font qu'une ligne), du plus récent au plus ancien. */
function messagesOf(evenements: EvenementBrevo[]): Message[] {
  const par = new Map<string, EvenementBrevo[]>();
  for (const e of evenements) {
    const k = e.messageId ?? `${e.subject}-${e.date}`;
    par.set(k, [...(par.get(k) ?? []), e]);
  }
  return [...par.values()]
    .flatMap((evs) => {
      const sort = sortDesEvenements(evs);
      const envoi = evs.reduce((min, e) => (e.date < min ? e.date : min), evs[0].date);
      return sort ? [{ subject: evs[0].subject ?? "", date: envoi, sort: sort.sort as string, clics: sort.clics }] : [];
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/**
 * GET /api/marketing/journey-emails?run=<id>  (ou ?client=<id> : son parcours de mise en production)
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

type RunDoc = {
  id: number | string;
  journeyKey?: string | null;
  partner?: unknown;
  client?: unknown;
  emails?: EnvoiPrevu[];
  sessionAt?: string | null;
  createdAt?: string;
};

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const runId = params.get("run");
  // Depuis la fiche (onglet « Signature ») : son parcours de mise en production.
  const forClient = params.get("client");
  if (!runId && !forClient) return NextResponse.json({ error: "missing_run" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const run = (
    runId
      ? await payload.findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true }).catch(() => null)
      : await productionRunOf(payload, forClient!)
  ) as RunDoc | null;
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
          .then((d) => d as { email?: string; onboardingStatus?: string; clientStatus?: string | null; signatureDate?: string | null } | null)
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

  const envois = ordonnerEnvois(croiserEnvois(prevus, evenements, Date.now(), faits));
  const autresEvenements = evenementsOrphelins(prevus, evenements);

  // Mise en production : faut-il relancer ? D'après le dernier e-mail qui demandait de signer.
  let conseil = null;
  if (run.journeyKey === PRODUCTION_KEY) {
    const signed = hasContractPhase(fiche?.clientStatus) || Boolean(fiche?.signatureDate);
    const inscrits = envois
      .filter((e) => ASKS_TO_SIGN.includes(baseEmailKey(e.key)) && e.date && e.sort !== "a-venir" && e.sort !== "non-programme")
      .map((e) => ({ at: e.date!, sort: e.sort as string }));
    // Les e-mails partis AVANT leur inscription sur le parcours (fiches déjà en
    // signature) : seuls ceux qui demandent de signer comptent — reconnus à leur
    // objet, depuis le lancement du parcours.
    const asksSubjects = new Set(PRODUCTION_EMAILS.filter((m) => ASKS_TO_SIGN.includes(baseEmailKey(m.key))).map((m) => cle(m.subject)));
    const anciens = messagesOf(autresEvenements)
      .filter((m) => (!run.createdAt || m.date >= run.createdAt) && asksSubjects.has(cle(m.subject)))
      .map((m) => ({ at: m.date, sort: m.sort as string }));
    const last = [...inscrits, ...anciens].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0] ?? null;
    conseil = signingAdvice(signed, last);
  }

  // Les autres messages, UN PAR MESSAGE (pas un par évènement Brevo) ; depuis la
  // fiche (onglet « Signature »), seulement ceux reçus depuis le lancement du parcours.
  const autres = messagesOf(autresEvenements).filter((m) => !forClient || !run.createdAt || m.date >= run.createdAt);

  return NextResponse.json({
    runId: run.id,
    configured: activite.configured,
    error: activite.error ?? null,
    adresse,
    conseil,
    envois,
    autres,
  });
}
