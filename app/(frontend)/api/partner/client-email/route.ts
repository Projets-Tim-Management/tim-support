import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { SITE_URL } from "@/core/lib/email-template";
import { markdownToHtml, markdownToPlain } from "@/modules/partner/lib/rich-text";
import { renderSignature, signatureText } from "@/modules/partner/lib/signature";
import { getDomainStatus, getSenders } from "@/modules/support/lib/brevo";

/**
 * Envoi d'un e-mail à une opportunité, depuis son onglet « Historique ».
 *
 * GET  ?client=<id>            → expéditeur(s) possibles + signature du partenaire
 * POST { client, to, cc, bcc, from, subject, body, signature?, attachments? } → envoie, puis trace
 *
 * QUI EXPÉDIE : un partenaire écrit TOUJOURS depuis sa propre adresse — c'est
 * son client, l'e-mail doit venir de lui. Il n'a donc aucun choix d'expéditeur,
 * et le serveur ne lit même pas le champ `from` qu'il enverrait : la règle vit
 * ici, pas dans l'écran, sinon un appel direct à l'API la contournerait.
 * Seul l'admin choisit, parmi les adresses vérifiées du compte Brevo.
 *
 * PAS DE REPLI. Tant que son adresse n'est pas utilisable, l'envoi est REFUSÉ —
 * on ne bascule pas discrètement sur l'adresse du support. Un message parti d'une
 * autre adresse que celle annoncée n'est pas le message qu'on croyait envoyer :
 * le client répond ailleurs, et le partenaire ne le sait pas. Tant que la
 * configuration n'est pas faite, il écrit depuis sa propre messagerie.
 *
 * Dans cet ORDRE : une trace sans envoi ferait croire qu'on a écrit à quelqu'un
 * qui n'a jamais rien reçu. L'inverse (envoyé sans trace) est récupérable, et
 * signalé dans la réponse.
 *
 * Le corps arrive en Markdown (le même éditeur que les notes) et part en HTML +
 * texte : reconstruit ici à partir de texte échappé, jamais réinjecté tel quel.
 *
 * La SIGNATURE du partenaire est ajoutée à l'envoi, jamais recopiée dans les
 * modèles : un numéro qui change se corrige alors à un seul endroit. Le
 * composeur peut la retirer POUR UN MESSAGE (`signature: false`) — une réponse
 * courte dans un échange déjà engagé n'a pas besoin d'une carte de visite.
 *
 * Le Reply-To porte l'adresse de l'utilisateur connecté : la réponse du client
 * arrive à la personne qui a écrit, pas dans la boîte du support.
 */

const MAX_BODY = 20_000;
/** Brevo plafonne, et un envoi commercial à 30 personnes n'est pas un envoi commercial. */
const MAX_RECIPIENTS = 20;

/**
 * Pièces jointes : 5 fichiers, 8 Mo au total.
 *
 * Le relais SMTP refuse au-delà d'une dizaine de mégaoctets, et un message
 * refusé pour cause de poids est un message qu'on croit envoyé. On plafonne
 * donc AVANT l'envoi, avec un message clair, plutôt que de laisser Brevo
 * renvoyer une erreur technique.
 */
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENTS_BYTES = 8 * 1024 * 1024;

/**
 * Résout des pièces jointes à partir d'IDENTIFIANTS de médias.
 *
 * Jamais à partir d'URL fournies par le navigateur : le serveur irait alors
 * chercher n'importe quelle adresse qu'on lui donne — y compris sur le réseau
 * interne. L'identifiant, lui, ne peut désigner qu'un fichier déjà téléversé.
 */
async function resolveAttachments(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  raw: unknown,
): Promise<
  | { ok: true; files: { filename: string; path: string }[]; ids: number[] }
  | { ok: false; error: string }
> {
  const ids = (Array.isArray(raw) ? raw : [])
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_ATTACHMENTS + 1);
  if (!ids.length) return { ok: true, files: [], ids: [] };
  if (ids.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `${MAX_ATTACHMENTS} pièces jointes au maximum.` };
  }

  const docs = await payload.find({
    collection: "media",
    where: { id: { in: ids } },
    limit: MAX_ATTACHMENTS,
    depth: 0,
    overrideAccess: true,
  });

  /**
   * URL ABSOLUE, toujours.
   *
   * Nodemailer interprète un `path` sans schéma comme un chemin de FICHIER : sur
   * un environnement sans stockage distant configuré, `/media/devis.pdf` était
   * cherché sur le disque, introuvable, et l'envoi entier partait en 502 — un
   * e-mail perdu pour une pièce jointe.
   */
  const absolute = (url: string) =>
    /^https?:\/\//i.test(url) ? url : `${SITE_URL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;

  let total = 0;
  const files: { filename: string; path: string }[] = [];
  // Les identifiants RETENUS, et non les premiers de la liste demandée : un
  // média introuvable ou sans fichier décalerait sinon la correspondance, et
  // l'activité porterait un lien vers une pièce qui n'a pas été envoyée — la
  // création échouerait, emportant la trace d'un e-mail pourtant parti.
  const kept: number[] = [];
  for (const doc of docs.docs as { id: number; url?: string; filename?: string; filesize?: number }[]) {
    if (!doc.url) continue;
    total += Number(doc.filesize ?? 0);
    files.push({ filename: doc.filename ?? `piece-jointe-${doc.id}`, path: absolute(doc.url) });
    kept.push(doc.id);
  }
  if (total > MAX_ATTACHMENTS_BYTES) {
    return { ok: false, error: "Pièces jointes trop lourdes (8 Mo au total au maximum)." };
  }
  return { ok: true, files, ids: kept };
}

/** Découpe et valide une liste d'adresses saisie à la main. */
function parseRecipients(raw: unknown): string[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ),
  ].slice(0, MAX_RECIPIENTS);
}

/**
 * Adresse d'expédition d'un partenaire : celle de SA fiche, à défaut celle de
 * son compte. C'est la même identité vue de deux endroits ; la fiche prime
 * parce qu'elle est l'adresse « commerciale », celle que le client connaît.
 */
async function partnerAddress(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  partnerId: unknown,
  userEmail?: string | null,
): Promise<string | null> {
  if (partnerId != null) {
    const fiche = (await payload
      .findByID({ collection: "partners", id: String(partnerId), depth: 0, overrideAccess: true })
      .catch(() => null)) as { email?: string | null } | null;
    if (fiche?.email) return fiche.email.trim().toLowerCase();
  }
  return userEmail ? userEmail.trim().toLowerCase() : null;
}

/** Vérifie que l'opportunité existe et que l'utilisateur a le droit d'y écrire. */
async function authorize(req: Request, clientId: unknown) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const doc = (await payload
    .findByID({ collection: "partner-clients", id: String(clientId), depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; partner?: unknown; companyName?: string } | null;
  if (!doc) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };

  const own = partnerIdOf(user);
  const partnerId =
    doc.partner && typeof doc.partner === "object" ? (doc.partner as { id?: unknown }).id : doc.partner;
  const allowed =
    hasAdminRole(user) || (isPartnerMetier(user) && String(own) === String(partnerId ?? ""));
  if (!allowed) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };

  return { payload, user, doc, partnerId, isAdmin: hasAdminRole(user) };
}

/**
 * L'adresse qui partira RÉELLEMENT, décidée côté serveur.
 *
 * `verified` dit si Brevo accepte cette adresse comme expéditeur. Sinon l'envoi
 * se fait depuis l'adresse par défaut, avec la sienne en réponse : le message
 * part, et la réponse revient quand même à la bonne personne. Refuser l'envoi
 * pour un compte Brevo mal configuré serait une punition sans rapport.
 */
async function resolveSender(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  args: { isAdmin: boolean; wanted?: string; partnerId: unknown; userEmail?: string | null },
): Promise<{ email: string; name?: string; verified: boolean; locked: boolean }> {
  const fallback = (process.env.EMAIL_FROM || "support@tim-management.co").toLowerCase();
  const senders = await getSenders({ fresh: true });
  const find = (email?: string | null) =>
    email ? senders.find((s) => s.email.toLowerCase() === email.toLowerCase()) : undefined;

  if (args.isAdmin) {
    // Sans choix explicite (l'ouverture du composeur), c'est SA propre adresse
    // qui s'impose si elle est vérifiée : un admin écrit à un client en son nom,
    // pas au nom du support. Sans ce repli, le composeur s'ouvrait sur une
    // adresse non retenue et annonçait une configuration manquante.
    const picked = find(args.wanted) ?? (args.wanted ? undefined : find(args.userEmail));
    return {
      email: picked?.email ?? fallback,
      name: picked?.name,
      verified: Boolean(picked),
      locked: false,
    };
  }

  // Partenaire : son adresse, et rien d'autre. `wanted` est ignoré.
  const own = await partnerAddress(payload, args.partnerId, args.userEmail);
  const picked = find(own);
  /**
   * Adresse inscrite ne suffit pas : son DOMAINE doit être authentifié.
   *
   * C'est la règle posée à l'écran (SenderSetup, deux étapes). Ne contrôler ici
   * que l'inscription la rendait contournable — il suffisait de rouvrir le
   * drawer pour envoyer depuis un domaine non signé, donc droit vers les
   * indésirables. La règle vit désormais au même endroit des deux côtés.
   */
  const domain = picked ? await getDomainStatus(picked.email.split("@")[1] ?? "") : null;
  return {
    email: picked?.email ?? own ?? fallback,
    name: picked?.name,
    verified: Boolean(picked) && Boolean(domain?.authenticated),
    locked: true,
  };
}

/**
 * Signature du partenaire de l'opportunité, prête à coller au bas du message.
 *
 * Lue à CHAQUE envoi plutôt que figée dans un modèle : la fiche est la seule
 * source, et une fonction ou un numéro corrigé s'applique au message suivant.
 */
async function signatureOf(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  partnerId: unknown,
): Promise<{ html: string; text: string }> {
  if (partnerId == null) return { html: "", text: "" };
  const fiche = (await payload
    .findByID({ collection: "partners", id: String(partnerId), depth: 1, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null;
  if (!fiche) return { html: "", text: "" };

  const media = (fiche.signaturePhoto ?? fiche.avatar) as { url?: string } | null | undefined;
  const sig = {
    name:
      [fiche.firstName, fiche.name].filter(Boolean).join(" ").trim() ||
      (fiche.displayName as string) ||
      (fiche.societe as string) ||
      null,
    jobTitle: (fiche.signatureJobTitle as string) ?? null,
    company: (fiche.signatureCompany as string) ?? (fiche.societe as string) ?? null,
    phone: (fiche.signaturePhone as string) ?? (fiche.mobile as string) ?? (fiche.phone as string) ?? null,
    website: (fiche.signatureWebsite as string) ?? null,
    photoUrl: media && typeof media === "object" ? (media.url ?? null) : null,
  };
  return { html: renderSignature(sig), text: signatureText(sig) };
}

/** Message d'aide quand l'adresse n'est pas encore utilisable. */
const NOT_READY =
  "Votre adresse n'est pas encore configurée comme expéditeur. Lancez la vérification " +
  "depuis le composeur — ou écrivez à ce client depuis votre messagerie habituelle.";

/**
 * Expéditeurs proposés dans le champ « De ».
 *
 * Brevo REFUSE un envoi depuis une adresse non vérifiée : proposer autre chose
 * que sa liste produirait des envois qui échouent au dernier moment. Sans clé
 * API configurée, on n'en propose aucun et l'adresse par défaut s'applique.
 */
export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("client");
  const auth = await authorize(req, clientId);
  if ("error" in auth) return auth.error;
  const { payload, user, partnerId, isAdmin } = auth;

  const [sender, signature] = await Promise.all([
    resolveSender(payload, { isAdmin, partnerId, userEmail: user.email }),
    signatureOf(payload, partnerId),
  ]);

  // Un partenaire ne reçoit AUCUNE liste : il n'a rien à choisir, et lui montrer
  // les adresses des autres n'aurait aucun sens.
  const senders = isAdmin
    ? (await getSenders({ fresh: true }))
        .sort((a, b) =>
          a.email === user.email ? -1 : b.email === user.email ? 1 : a.email.localeCompare(b.email),
        )
        .map((s) => ({ email: s.email, name: s.name }))
    : [];

  return NextResponse.json({
    default: sender.email,
    locked: sender.locked,
    verified: sender.verified,
    fallback: process.env.EMAIL_FROM || "support@tim-management.co",
    senders,
    // Ce qui sera réellement collé au bas du message — le composeur l'affiche
    // tel quel, plutôt que de promettre « une signature » sans la montrer.
    signatureHtml: signature.html,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await authorize(req, body.client);
  if ("error" in auth) return auth.error;
  const { payload, user, doc } = auth;

  const to = parseRecipients(body.to);
  const cc = parseRecipients(body.cc);
  const bcc = parseRecipients(body.bcc);
  const objet = String(body.subject ?? "").trim();
  const markdown = String(body.body ?? "").trim();

  if (!to.length || !objet || !markdown) {
    return NextResponse.json(
      { error: "Destinataire, objet et message sont requis." },
      { status: 400 },
    );
  }
  if (markdown.length > MAX_BODY) {
    return NextResponse.json({ error: "Message trop long." }, { status: 400 });
  }

  // Expéditeur décidé ICI : un partenaire écrit depuis son adresse, un admin
  // depuis celle qu'il a choisie. Le `from` du client n'est lu que pour l'admin.
  const sender = await resolveSender(payload, {
    isAdmin: auth.isAdmin,
    wanted: String(body.from ?? "").trim(),
    partnerId: auth.partnerId,
    userEmail: user.email,
  });

  const attached = await resolveAttachments(payload, body.attachments);
  if (!attached.ok) return NextResponse.json({ error: attached.error }, { status: 400 });

  // Signature retirée pour CE message : le composeur l'a explicitement décochée.
  const signature =
    body.signature === false ? { html: "", text: "" } : await signatureOf(payload, auth.partnerId);

  // Adresse pas encore utilisable : on refuse, on n'improvise pas d'expéditeur.
  if (!sender.verified) {
    return NextResponse.json({ error: NOT_READY, senderNotReady: true }, { status: 409 });
  }

  try {
    await payload.sendEmail({
      to: to.join(","),
      ...(cc.length ? { cc: cc.join(",") } : {}),
      ...(bcc.length ? { bcc: bcc.join(",") } : {}),
      from: sender.name ? `${sender.name} <${sender.email}>` : sender.email,
      subject: objet,
      ...(attached.files.length ? { attachments: attached.files } : {}),
      html: markdownToHtml(markdown) + signature.html,
      // Version texte : certains clients l'affichent, et elle évite qu'un
      // message sans corps HTML lisible parte totalement vide.
      text: markdownToPlain(markdown) + (signature.text ? `\n\n--\n${signature.text}` : ""),
      // Réponse à l'expéditeur RÉEL : sa propre adresse, même quand le message
      // a dû partir depuis celle du support.
      replyTo: sender.email,
    });
  } catch (e) {
    payload.logger.error(`[historique] e-mail vers ${to.join(",")} non parti : ${e}`);
    return NextResponse.json({ error: "L'e-mail n'a pas pu être envoyé." }, { status: 502 });
  }

  // Ce qui est tracé est ce qui est PARTI, copies comprises : sans cela, un
  // « pourquoi n'a-t-il pas répondu ? » se règle en rouvrant sa messagerie.
  const trace = [
    to.join(", "),
    cc.length ? `cc : ${cc.join(", ")}` : null,
    bcc.length ? `cci : ${bcc.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    await payload.create({
      collection: "client-activities",
      data: {
        client: doc.id as number,
        type: "email",
        title: objet,
        content: markdown,
        recipients: trace,
        // Ce qui est parti AVEC le message : « je vous ai envoyé le devis » se
        // vérifie alors ici, six mois plus tard, sans rouvrir sa messagerie.
        ...(attached.ids.length ? { attachments: attached.ids } : {}),
        occurredAt: new Date().toISOString(),
        author: user.id,
      },
      overrideAccess: true,
    });
  } catch (e) {
    // L'e-mail EST parti : on ne renvoie pas une erreur qui inviterait à le
    // renvoyer. On le dit, et la trace manquante se rattrape à la main.
    payload.logger.error(`[historique] e-mail envoyé mais non tracé (client ${doc.id}) : ${e}`);
    return NextResponse.json({ ok: true, logged: false });
  }

  payload.logger.info(
    `[historique] e-mail « ${objet} » envoyé à ${to.length + cc.length + bcc.length} destinataire(s) ` +
      `pour l'opportunité ${doc.id}` +
      `${attached.files.length ? `, ${attached.files.length} pièce(s) jointe(s)` : ""}.`,
  );
  return NextResponse.json({ ok: true, logged: true });
}
