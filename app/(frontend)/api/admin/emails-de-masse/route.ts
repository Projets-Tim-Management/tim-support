import { NextResponse } from "next/server";

import { hasAdminRole, partnerIdOf } from "@/core/access";
import { isSuppressed, unsubscribeHeaders } from "@/core/lib/email-suppression";
import { payloadClient } from "@/core/payload-client";
import { buildMassEmail, parseRecipients, type MassEmailTemplate } from "@/modules/marketing/lib/mass-email";
import { availableSenders, massEmailContext, pickSender, signatureForSender } from "@/modules/marketing/lib/mass-email-server";

/**
 * E-mail de masse (écran Marketing → E-mail de masse, /admin/emails-de-masse).
 *
 * GET                                    → modèles, expéditeur, signature
 * POST { action: "save", name, … }       → enregistre le message comme modèle
 * POST { action: "delete", key }         → supprime un modèle enregistré
 * POST { action: "preview", … }          → le message tel qu'il partira (1er destinataire)
 * POST { action: "test", … }             → l'envoie à soi seul
 * POST { action: "send", recipients, … } → UN e-mail par adresse
 *
 * UN e-mail par adresse, jamais de copie ni de copie cachée : chaque
 * destinataire reçoit un message qui n'est adressé qu'à lui, et ne voit pas à
 * qui d'autre on a écrit. Même règle que l'annonce des développements
 * (api/dev/announce).
 *
 * Admin seul. L'envoi est un geste fait depuis l'écran, après relecture de
 * l'aperçu.
 */

/**
 * Cinq minutes, le maximum de Vercel : les e-mails partent UN PAR UN dans cette
 * requête, et une requête coupée en route laisserait une partie des clients
 * servis, la campagne non enregistrée — et un second clic renverrait l'e-mail à
 * ceux qui l'ont déjà reçu. Sans cette ligne, c'est la durée par défaut de la
 * plateforme qui s'applique, bien trop courte pour quelques dizaines d'envois.
 */
export const maxDuration = 300;

/** Au-delà, ce n'est plus un envoi personnel mais une campagne : c'est Brevo. */
const MAX_RECIPIENTS = 300;

type Body = {
  action?: string;
  /** Suppression : la clé du modèle (`saved-<id>`). */
  key?: string;
  /** Nom du modèle de départ, gardé avec la campagne. */
  templateLabel?: string;
  name?: string;
  /** Adresse d'expédition choisie à l'écran — revérifiée ici. */
  from?: string;
  /** `false` : envoyer sans signature. */
  signature?: boolean;
  subject?: string;
  body?: string;
  closing?: string;
  preheader?: string;
  recipients?: string;
};


async function guard(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || !hasAdminRole(user)) return { payload, user: null };
  return { payload, user: user as { email?: string | null; partner?: unknown } };
}

export async function GET(req: Request) {
  const { payload, user } = await guard(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await massEmailContext(payload, user));
}

export async function POST(req: Request) {
  const { payload, user } = await guard(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }
  const message = {
    subject: (body.subject ?? "").trim().slice(0, 200),
    body: (body.body ?? "").trim().slice(0, 10000),
    closing: (body.closing ?? "").trim().slice(0, 120),
    preheader: (body.preheader ?? "").trim().slice(0, 200) || undefined,
  };
  const { valid, invalid } = parseRecipients(body.recipients ?? "");
  // Signature retirée pour CET envoi si la case est décochée.
  // Signature de l'EXPÉDITEUR choisi (voir signatureForSender) ; retirée si la case est décochée.
  const signature =
    body.signature === false ? { html: "", text: "" } : await signatureForSender(payload, body.from ?? user.email, user);

  /**
   * Enregistrer comme modèle : dans « Modèles d'e-mail », à SON nom (portée
   * partenaire) — il le retrouve ici et dans le composeur de ses opportunités,
   * sans l'imposer aux autres partenaires.
   */
  /**
   * Supprimer un modèle ENREGISTRÉ (les modèles fournis par le code ne se
   * suppriment pas). Les siens, et ceux de TIM — l'écran prévient qu'un modèle
   * TIM disparaît aussi du composeur des opportunités.
   */
  if (body.action === "delete") {
    const id = /^saved-(.+)$/.exec(body.key ?? "")?.[1];
    if (!id) return NextResponse.json({ error: "Ce modèle ne peut pas être supprimé." }, { status: 400 });
    const doc = (await payload
      .findByID({ collection: "email-templates", id, depth: 0, overrideAccess: true })
      .catch(() => null)) as { scope?: string; partner?: unknown } | null;
    if (!doc) return NextResponse.json({ ok: true });
    const own = String(partnerIdOf({ partner: doc.partner }) ?? "") === String(partnerIdOf(user) ?? "-");
    if (doc.scope !== "tim" && !own) {
      return NextResponse.json({ error: "Ce modèle appartient à un autre partenaire." }, { status: 403 });
    }
    await payload.delete({ collection: "email-templates", id, overrideAccess: true });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save") {
    const name = (body.name ?? "").trim().slice(0, 120);
    const partnerId = partnerIdOf(user);
    if (!name) return NextResponse.json({ error: "Donnez un nom au modèle." }, { status: 400 });
    if (!message.subject || !message.body) {
      return NextResponse.json({ error: "L'objet et le message sont obligatoires." }, { status: 400 });
    }
    if (partnerId == null) {
      return NextResponse.json({ error: "Votre compte n'est relié à aucune fiche partenaire." }, { status: 409 });
    }
    const doc = await payload.create({
      collection: "email-templates",
      data: { name, subject: message.subject, body: message.body, scope: "partenaire", partner: partnerId } as never,
      overrideAccess: true,
    });
    const template: MassEmailTemplate = {
      key: `saved-${doc.id}`,
      label: name,
      description: "Votre modèle enregistré",
      subject: message.subject,
      body: message.body,
      closing: message.closing || "Bien cordialement,",
    };
    return NextResponse.json({ ok: true, template });
  }

  if (body.action === "preview") {
    const mail = buildMassEmail({ ...message, firstName: valid[0]?.firstName ?? null, signature });
    return NextResponse.json({ subject: mail.subject, html: mail.html });
  }

  if (!message.subject || !message.body) {
    return NextResponse.json({ error: "L'objet et le message sont obligatoires." }, { status: 400 });
  }

  const sender = pickSender(await availableSenders(), body.from, user.email);
  if (!sender) {
    return NextResponse.json(
      {
        error:
          "Cette adresse n'est pas utilisable comme expéditeur : elle doit être inscrite chez Brevo, avec un domaine authentifié.",
      },
      { status: 409 },
    );
  }
  const from = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
  const replyTo = sender.email;

  /**
   * Tag Brevo PROPRE à cet envoi : c'est par lui que Brevo rend, plus tard, les
   * ouvertures et les clics de CETTE campagne et d'aucune autre. Le test a le
   * sien, pour ne pas fausser les chiffres.
   */
  const tag =
    body.action === "send" ? `masse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` : "masse-test";

  const send = async (to: string, firstName: string | null) => {
    const mail = buildMassEmail({ ...message, firstName, signature });
    await payload.sendEmail({
      to,
      from,
      replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Désinscription offerte par la messagerie elle-même, sans rien peser dans
      // le texte (même principe que les séquences).
      headers: { ...unsubscribeHeaders(to), "X-Mailin-Tag": tag },
    });
  };

  // Test : à soi seul, avec le prénom du premier destinataire s'il y en a un.
  if (body.action === "test") {
    try {
      // Au compte connecté, pas à l'expéditeur : envoyer depuis une adresse
      // partagée ne doit pas faire atterrir le test dans une autre boîte.
      const testTo = (user.email ?? sender.email).trim().toLowerCase();
      await send(testTo, valid[0]?.firstName ?? null);
      return NextResponse.json({ ok: true, to: testTo });
    } catch (err) {
      payload.logger.error(`[e-mail de masse] test non parti : ${err}`);
      return NextResponse.json({ error: "L'e-mail de test n'a pas pu partir." }, { status: 502 });
    }
  }

  if (body.action !== "send") return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  if (valid.length === 0) return NextResponse.json({ error: "Aucune adresse valide." }, { status: 400 });
  if (valid.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `${MAX_RECIPIENTS} destinataires au plus par envoi.` }, { status: 400 });
  }

  type Result = { email: string; status: "sent" | "suppressed" | "failed" };
  const deliver = async (r: (typeof valid)[number]): Promise<Result> => {
    if (await isSuppressed(payload, r.email)) return { email: r.email, status: "suppressed" };
    try {
      await send(r.email, r.firstName);
      return { email: r.email, status: "sent" };
    } catch (err) {
      payload.logger.error(`[e-mail de masse] non parti vers ${r.email} : ${err}`);
      return { email: r.email, status: "failed" };
    }
  };

  /**
   * Cinq envois à la fois : assez pour qu'un envoi à 300 tienne dans la durée
   * de la requête, assez peu pour ne pas se faire réguler par le relais Brevo.
   * Chaque message reste UN e-mail pour UNE adresse — on parallélise les envois,
   * jamais les destinataires.
   */
  const results: Result[] = [];
  for (let i = 0; i < valid.length; i += 5) {
    results.push(...(await Promise.all(valid.slice(i, i + 5).map(deliver))));
  }

  const sent = results.filter((r) => r.status === "sent").length;
  payload.logger.info(`[e-mail de masse] « ${message.subject} » envoyé par ${sender.email} : ${sent}/${valid.length}.`);

  // La trace de la campagne : la liste « Campagnes envoyées » et ses chiffres.
  const campaign = await payload
    .create({
      collection: "mass-email-campaigns",
      data: {
        subject: message.subject,
        sentAt: new Date().toISOString(),
        tag,
        fromEmail: sender.email,
        withSignature: body.signature !== false,
        templateLabel: (body.templateLabel ?? "").slice(0, 120) || undefined,
        sentBy: (user as { id?: number | string }).id as never,
        body: message.body,
        closing: message.closing,
        sentCount: sent,
        suppressedCount: results.filter((r) => r.status === "suppressed").length,
        failedCount: results.filter((r) => r.status === "failed").length,
        recipients: results,
      } as never,
      overrideAccess: true,
    })
    .catch((err) => {
      payload.logger.error(`[e-mail de masse] campagne « ${message.subject} » non enregistrée : ${err}`);
      return null;
    });

  return NextResponse.json({ ok: true, results, invalid, campaignId: campaign?.id ?? null });
}
