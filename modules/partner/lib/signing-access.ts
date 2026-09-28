import type { Payload, PayloadRequest } from "payload";

import { readEmailTexts } from "@/modules/marketing/lib/email-overrides";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { PHASE_DE_TEST_KEY } from "@/modules/marketing/lib/journey";

/**
 * L'accès à l'espace client d'une affaire qu'on vient de SIGNER.
 *
 * Une affaire conclue sans phase de test n'a pas d'espace : c'est le parcours
 * de test qui le crée d'ordinaire. Or le client en a besoin pour signer — y
 * trouver son devis, son contrat, et compléter ses informations de facturation.
 *
 * Deux temps, parce qu'on ne prévient pas toujours le client le jour même :
 *   - l'accès est CRÉÉ au passage en « Gagnée », fermé si on ne l'invite pas
 *     encore — l'adresse est connue, le client ne peut pas encore se connecter ;
 *   - l'invitation part tout de suite si on l'a demandé, sinon plus tard, d'un
 *     clic sur l'onglet « Signature » de la fiche.
 *
 * L'invitation est celle de la signature (« Bienvenue chez TIM »), pas celle
 * du test : un client qui signe n'a pas de démarrage à préparer.
 */

/**
 * Drapeau de contexte : l'ouverture vient d'ici, qui envoie SON invitation.
 * Sans lui, le hook des accès enverrait en plus celle de la phase de test à un
 * client qui aurait encore un parcours ouvert — deux messages pour une porte.
 */
export const SIGNING_INVITE_CONTEXT = "signingInvite";

export type SigningAccessResult =
  | { ok: true; created: boolean; invited: boolean; email: string }
  | { ok: false; reason: "no_client" | "no_email" | "email_taken" | "send_failed" | "no_template" };

type Account = {
  id: number | string;
  email?: string;
  firstName?: string | null;
  active?: boolean;
};

async function accountOf(payload: Payload, clientId: number | string, req?: PayloadRequest) {
  const res = await payload.find({
    collection: "client-portal-accounts",
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  return (res.docs[0] as Account | undefined) ?? null;
}

/** Les textes retouchés dans l'écran des modèles d'e-mail, s'il y en a. */
async function signingTexts(payload: Payload, req?: PayloadRequest) {
  const journey = (
    await payload
      .find({
        collection: "marketing-journeys",
        where: { key: { equals: PHASE_DE_TEST_KEY } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => ({ docs: [] }))
  ).docs[0] as { id?: number | string } | undefined;
  return journey?.id != null ? readEmailTexts(payload, journey.id, "invitation-signature", req) : {};
}

/**
 * Crée l'accès s'il manque, l'ouvre et envoie l'invitation si `invite`.
 *
 * Sans `invite`, l'accès est créé FERMÉ (ou laissé tel quel s'il existe) :
 * rien ne part, rien ne s'ouvre. C'est le « plus tard ».
 */
export async function ensureSigningAccess(
  payload: Payload,
  clientId: number | string,
  opts: { invite: boolean },
  req?: PayloadRequest,
): Promise<SigningAccessResult> {
  const client = (await payload
    .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { companyName?: string | null; email?: string | null } | null;
  if (!client) return { ok: false, reason: "no_client" };

  const context = { [SIGNING_INVITE_CONTEXT]: true };
  let account = await accountOf(payload, clientId, req);
  let created = false;

  if (!account) {
    const email = client.email?.trim();
    if (!email) return { ok: false, reason: "no_email" };
    try {
      account = (await payload.create({
        collection: "client-portal-accounts",
        data: { client: clientId, email, active: opts.invite } as never,
        overrideAccess: true,
        req,
        context,
      })) as Account;
      created = true;
    } catch (err) {
      // L'adresse sert d'identifiant de connexion : unique. Déjà prise par
      // l'accès d'une autre fiche, on le dit plutôt que d'échouer en silence.
      payload.logger.warn(`[signature] accès espace client non créé pour ${clientId} : ${err}`);
      return { ok: false, reason: "email_taken" };
    }
  } else if (opts.invite && account.active === false) {
    await payload.update({
      collection: "client-portal-accounts",
      id: account.id,
      data: { active: true },
      overrideAccess: true,
      req,
      context,
    });
  }

  const email = account.email ?? client.email ?? "";
  if (!opts.invite) return { ok: true, created, invited: false, email };

  const template = JOURNEY_EMAILS["invitation-signature"];
  if (!template) return { ok: false, reason: "no_template" };
  const built = template({
    clientName: client.companyName ?? null,
    contactFirstName: account.firstName ?? null,
    texts: await signingTexts(payload, req),
  });

  try {
    await payload.sendEmail({ to: email, subject: built.subject, html: built.html, text: built.text });
  } catch (err) {
    payload.logger.error(`[signature] invitation à ${email} échouée : ${err}`);
    return { ok: false, reason: "send_failed" };
  }

  // Même trace que l'invitation isolée : l'encart la relit pour dire quand
  // l'invitation est partie. Un marquage raté ne fait pas croire l'envoi perdu.
  await payload
    .update({
      collection: "client-portal-accounts",
      id: account.id,
      data: { invitationSentAt: new Date().toISOString() } as never,
      overrideAccess: true,
      req,
      context,
    })
    .catch((err) => payload.logger.error(`[signature] date d'invitation non marquée : ${err}`));

  return { ok: true, created, invited: true, email };
}

/** Message affichable pour chaque échec, côté fiche. */
export const SIGNING_ACCESS_ERRORS: Record<string, string> = {
  no_client: "Fiche introuvable.",
  no_email: "Ajoutez l'adresse e-mail du client sur la fiche : c'est son identifiant de connexion.",
  email_taken:
    "Cette adresse e-mail sert déjà à l'espace d'une autre fiche. Changez l'adresse du client, ou demandez à un admin.",
  send_failed: "L'accès est ouvert, mais l'e-mail n'est pas parti. Réessayez dans un instant.",
  no_template: "Modèle d'invitation introuvable.",
};
