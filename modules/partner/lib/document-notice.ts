import type { Payload } from "payload";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { baseEmailKey } from "@/modules/marketing/lib/journey";
import { productionRunOf, signingMail, SIGNING_STEP } from "@/modules/marketing/lib/run-mail-log";
import { SIGNABLE, type SignableKind } from "@/modules/partner/lib/e-signature";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * « Un document vous attend dans votre espace TIM » : le devis ou le contrat
 * déposé, annoncé au client. Part tout seul au dépôt (hook de la fiche) — et à
 * la main depuis l'onglet « Signature » quand le client n'a pas été prévenu
 * (accès fermé au moment du dépôt). Un seul code pour les deux chemins.
 */

type Account = { email?: string; firstName?: string | null; active?: boolean };
type ClientDoc = { id: number | string; companyName?: string | null } & Record<string, unknown>;

/** L'étape de la mise en production qu'annonce l'avis : « Devis envoyé » ou « Contrat envoyé ». */
export const noticeStepOf = (kind: SignableKind) => (kind === "contrat" ? SIGNING_STEP.contratDisponible : SIGNING_STEP.devisDisponible);

async function accountOf(payload: Payload, clientId: number | string): Promise<Account | null> {
  const res = await payload.find({ collection: "client-portal-accounts", where: { client: { equals: clientId } }, limit: 1, depth: 0, overrideAccess: true });
  return (res.docs[0] as Account | undefined) ?? null;
}

export type NoticeResult = { ok: true; email: string } | { ok: false; reason: string };

/** Envoie l'avis pour `kind`. Le document doit être déposé, l'accès du client ouvert. */
export async function sendDocumentNotice(payload: Payload, client: ClientDoc, kind: SignableKind): Promise<NoticeResult> {
  if (!client[SIGNABLE[kind].original]) return { ok: false, reason: `Déposez d'abord ${SIGNABLE[kind].article} sur la fiche.` };
  const account = await accountOf(payload, client.id);
  if (!account?.email || account.active === false) return { ok: false, reason: "Ouvrez d'abord l'accès du client à son espace (bouton de l'étape 1)." };
  const built = JOURNEY_EMAILS["document-disponible"]({
    clientName: client.companyName ?? null,
    contactFirstName: account.firstName ?? null,
    documentNoun: SIGNABLE[kind].noun,
    texts: await templateTexts(payload, "document-disponible"),
  });
  const mail = await signingMail(payload, client.id);
  await payload.sendEmail({ to: account.email, subject: built.subject, html: built.html, text: built.text, ...mail.mailHeaders });
  await mail.record("document-disponible", built.subject, account.email, noticeStepOf(kind));
  return { ok: true, email: account.email };
}

/** L'avis est-il déjà parti pour ce document ? D'après le parcours de mise en production (heure d'envoi). */
export async function noticeSentAt(payload: Payload, clientId: number | string, kind: SignableKind): Promise<string | null> {
  const run = await productionRunOf(payload, clientId);
  const line = (run?.emails ?? []).find((l) => baseEmailKey(l.key) === "document-disponible" && l.stepKey === noticeStepOf(kind) && l.sentAt);
  return (line?.sentAt as string | undefined) ?? null;
}
