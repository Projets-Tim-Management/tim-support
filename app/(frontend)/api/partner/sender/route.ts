import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { getDomainStatus, getSenders, requestSenderVerification } from "@/modules/support/lib/brevo";

/**
 * Adresse d'expédition d'un partenaire : état et mise en conformité.
 *
 * GET  → { email, senderVerified, domain, domainAuthenticated, records }
 * POST { action: "sender" } → inscrit l'adresse (Brevo envoie un lien de confirmation)
 * POST { action: "domain" } → crée le domaine chez Brevo et renvoie ses 3 enregistrements DNS
 *
 * POURQUOI DEUX ÉTAPES. Brevo n'accepte d'envoyer que depuis une adresse
 * inscrite ET dont le domaine est authentifié :
 *  - l'adresse prouve que son propriétaire est d'accord (il clique un lien) ;
 *  - le domaine prouve que l'envoi est légitime (SPF/DKIM signés par le
 *    partenaire). Sans lui, un message expédié depuis « untel@son-domaine.fr »
 *    n'est signé par personne : les politiques DMARC modernes le rangent en
 *    indésirables. Un e-mail commercial qui atterrit en spam est pire qu'un
 *    e-mail non envoyé — on ne le sait pas.
 *
 * L'adresse n'est JAMAIS prise dans la requête : elle est relue depuis la fiche
 * du demandeur. Sans quoi n'importe qui pourrait faire inscrire n'importe quelle
 * adresse et déclencher un e-mail de validation chez un tiers.
 */

/** Fiche + adresse d'expédition du demandeur. */
async function own(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!hasAdminRole(user) && !isPartnerMetier(user)) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const partnerId = partnerIdOf(user);
  const fiche = partnerId
    ? ((await payload
        .findByID({ collection: "partners", id: String(partnerId), depth: 0, overrideAccess: true })
        .catch(() => null)) as {
        email?: string | null;
        displayName?: string | null;
        societe?: string | null;
        name?: string | null;
      } | null)
    : null;

  const email = (fiche?.email || user.email || "").trim().toLowerCase();
  if (!email) {
    return {
      error: NextResponse.json({ error: "Aucune adresse sur votre fiche partenaire." }, { status: 400 }),
    };
  }
  return {
    payload,
    email,
    name: fiche?.displayName || fiche?.societe || fiche?.name || email,
    domain: email.split("@")[1] ?? "",
  };
}

export async function GET(req: Request) {
  const me = await own(req);
  if ("error" in me) return me.error;

  const [senders, domain] = await Promise.all([
    getSenders({ fresh: true }),
    // Lecture seule : on ne crée pas un domaine chez Brevo au simple affichage
    // d'un écran. La création est un geste explicite (POST action=domain).
    getDomainStatus(me.domain),
  ]);

  return NextResponse.json({
    email: me.email,
    senderVerified: senders.some((s) => s.email.toLowerCase() === me.email),
    domain: me.domain,
    domainAuthenticated: Boolean(domain?.authenticated),
    records: domain?.records ?? [],
  });
}

export async function POST(req: Request) {
  const me = await own(req);
  if ("error" in me) return me.error;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  if (action === "domain") {
    const status = await getDomainStatus(me.domain, { create: true });
    if (!status) {
      return NextResponse.json({ error: "Domaine refusé par Brevo." }, { status: 502 });
    }
    me.payload.logger.info(
      `[expéditeur] domaine ${me.domain} : ${status.authenticated ? "authentifié" : "à configurer"}.`,
    );
    return NextResponse.json({ ok: true, ...status });
  }

  const result = await requestSenderVerification(me.email, me.name);
  if (result.status === "error") {
    me.payload.logger.error(`[expéditeur] inscription de ${me.email} refusée : ${result.message}`);
    return NextResponse.json({ error: result.message ?? "Demande refusée." }, { status: 502 });
  }
  me.payload.logger.info(`[expéditeur] ${me.email} : ${result.status}.`);
  return NextResponse.json({ ok: true, status: result.status, email: me.email });
}
