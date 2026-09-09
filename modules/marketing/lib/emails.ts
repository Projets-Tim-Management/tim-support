import {
  BORDER,
  FONT,
  INK,
  MUTED,
  OUTER,
  SITE_URL,
  escape,
  paragraph,
  refBox,
  shell,
} from "@/core/lib/email-template";
// Le fuseau des créneaux, pris à sa source : c'est en heure de Paris que le
// partenaire déclare ses disponibilités, et en UTC qu'on les stocke.
import { defaultSlotText } from "@/modules/marketing/lib/email-slots";
import { CLIENT_DECISIONS } from "@/modules/marketing/lib/journey";
import { safeRunToken } from "@/modules/marketing/lib/run-token";
import { applyJourneyVars } from "@/modules/marketing/lib/journey-vars";
import { REVIEW_DURATION_MIN } from "@/modules/marketing/lib/session-calendar";
import { TIMEZONE as PARIS } from "@/modules/marketing/lib/scheduling";
import {
  SATISFACTION_LEVELS,
  satisfactionUrl,
} from "@/modules/marketing/lib/satisfaction";
import { profileRank } from "@/modules/partner/lib/pricing";

/**
 * Les e-mails de la phase de test, rédigés.
 *
 * Règles de rédaction, tenues sur les seize messages :
 *  - UN objectif par e-mail, UNE action. Un message qui demande deux choses
 *    n'en obtient aucune.
 *  - On écrit à un chef d'entreprise du BTP : phrases courtes, pas de jargon
 *    logiciel, et la raison AVANT la demande.
 *  - Ce qui est vrai le reste : aucune promesse que le produit ne tient pas,
 *    aucun chiffre inventé. Les valeurs manquantes se retirent, elles ne se
 *    remplacent pas par « — ».
 *  - Chaque message dit ce qui se passe s'il n'est pas suivi d'effet.
 *
 * L'HABILLAGE vient de `core/lib/email-template` : les messages au client et au
 * partenaire portent la charte complète, les alertes internes une enveloppe
 * sobre. Voir ce fichier pour le rendu.
 */

export type BuiltEmail = { subject: string; text: string; html: string };

/** Tout ce qu'un message du parcours peut avoir à dire. Champs absents = lignes retirées. */
export type JourneyEmailContext = {
  /**
   * Le parcours d'où part le message. Sert aux liens qui RENVOIENT une réponse
   * dedans — les visages de « Comment ça se passe ? ». Absent, le message reste
   * juste : il perd seulement ses liens de réponse.
   */
  runId?: number | string | null;
  /**
   * Blocs de texte repris à la main sur le modèle de parcours, par nom de bloc.
   * Absent ou vide pour un bloc = le texte du code. Voir `email-overrides.ts`.
   */
  texts?: Record<string, string | undefined>;
  clientName?: string | null;
  /** Prénom du contact, pour l'appel. Absent → « Bonjour, ». */
  contactFirstName?: string | null;
  partnerName?: string | null;
  /** Modalité de la session : « en visio », « sur site — 12 rue… ». */
  sessionModality?: string | null;
  /** Lien de visio, quand la session s'y tient. Le nommer vaut mieux que le
   *  résumer : un client qui reçoit « lien fourni » cherche encore le lien. */
  sessionLink?: string | null;
  sessionAt?: string | null;
  /** Créneau du bilan de fin de test, et son lien de visio. */
  reviewAt?: string | null;
  reviewLink?: string | null;
  /**
   * Qui suivra la session, déclaré par le client en réservant. Le partenaire
   * prépare sa session en sachant à qui il s'adresse — « une entreprise » ne se
   * prépare pas.
   */
  sessionAttendee?: { firstName?: string | null; lastName?: string | null; role?: string | null; email?: string | null } | null;
  /** Invités supplémentaires, conviés à l'agenda au même titre. */
  sessionGuests?: { email?: string | null; name?: string | null }[] | null;
  startDate?: string | null;
  endDate?: string | null;
  durationWeeks?: number | null;
  /** Nombre d'accès créés, pour l'e-mail de remise. */
  credentialCount?: number | null;
  /**
   * Date limite pour compléter le dossier de démarrage. Elle vient de l'échéance
   * de l'étape correspondante — pas d'un délai réinventé dans le texte.
   */
  dossierDeadline?: string | null;
  /** Code à usage unique — uniquement pour l'e-mail de connexion. */
  code?: string | null;
  /**
   * Phases de test du partenaire, pour le récapitulatif hebdomadaire. Un digest
   * qui se contente d'un lien ne se lit pas : ce qu'on veut savoir, c'est quel
   * client attend quoi, sans ouvrir le back-office.
   */
  partnerRuns?: Array<{
    clientName: string;
    currentStep?: string | null;
    endDate?: string | null;
    /** Jours restants avant la fin du test. Négatif = terminé. */
    daysLeft?: number | null;
  }> | null;
};

const PORTAL = `${SITE_URL}/espace-client`;

const hello = (ctx: JourneyEmailContext) =>
  ctx.contactFirstName?.trim()
    ? `Bonjour ${escape(ctx.contactFirstName.trim())},`
    : "Bonjour,";

/**
 * Un BLOC de texte : celui de la table, ou celui repris à la main.
 *
 * Le texte est le MÊME dans les deux cas et suit le même chemin : variables
 * remplacées, puis échappé, puis mis en forme. Un texte n'est jamais du HTML —
 * coller une balise dans un champ ne doit pas pouvoir casser un message, ni y
 * glisser quoi que ce soit.
 *
 * Une seule source alimente les deux versions du message : `**gras**` devient
 * `<strong>` en HTML et disparaît en texte brut, un retour à la ligne devient
 * `<br>`. Deux textes séparés auraient divergé au premier correctif.
 */
type Bloc = { html: string; text: string };

/** `**gras**` → `<strong>`, retours à la ligne → `<br>`. Après échappement. */
const enrichir = (echappe: string): string =>
  echappe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");

/** Les marques de mise en forme, retirées : la version texte n'en a pas l'usage. */
const depouiller = (brut: string): string => brut.replace(/\*\*([^*]+)\*\*/g, "$1");

const bloc = (ctx: JourneyEmailContext, key: string, slot: string): Bloc => {
  const source = ctx.texts?.[slot]?.trim() || defaultSlotText(key, slot);
  const rempli = applyJourneyVars(source, journeyVarValues(ctx));
  return { html: enrichir(escape(rempli)), text: depouiller(rempli) };
};

/** Les valeurs des variables pour CE message. Voir `journey-vars.ts`. */
const journeyVarValues = (ctx: JourneyEmailContext): Record<string, string | number | null> => ({
  prenom: ctx.contactFirstName?.trim() || null,
  entreprise: ctx.clientName?.trim() || null,
  partenaire: ctx.partnerName?.trim() || null,
  date_debut: frDate(ctx.startDate),
  date_fin: frDate(ctx.endDate),
  date_session: frDateTime(ctx.sessionAt),
  date_bilan: frDateTime(ctx.reviewAt),
  modalite_session: ctx.sessionModality ?? null,
  nb_acces: ctx.credentialCount ?? null,
  date_limite_dossier: frDate(ctx.dossierDeadline),
  duree_semaines: ctx.durationWeeks ?? null,
  // Tiré au hasard à l'envoi, jamais conservé : il n'existe que le temps de ce
  // message. C'est aussi le seul objet qui porte une donnée utile avant
  // ouverture — on lit son code depuis la notification.
  code: ctx.code ?? null,
});

/**
 * Un texte simple qui n'existe QU'EN HTML : le titre, la ligne d'aperçu, le
 * libellé d'un bouton.
 *
 * Échappé dès qu'il est repris, parce que ni `shell` ni `button` ne le font :
 * ils reçoivent du HTML écrit par nous. Un texte venu d'un champ, lui, n'est
 * jamais du HTML.
 *
 * L'ADRESSE d'un bouton ne se reprend jamais : un lien retapé à la main est un
 * lien mort, et c'est la seule chose du message qu'on ne puisse pas corriger
 * après coup.
 */
/**
 * L'OBJET du message.
 *
 * Ni échappé ni mis en forme, contrairement au reste : un objet n'est pas du
 * HTML, il voyage dans un en-tête. `&amp;` s'y afficherait tel quel, et un
 * retour à la ligne y couperait l'en-tête — d'où l'aplatissement.
 */
const sujet = (ctx: JourneyEmailContext, key: string, slot = "objet"): string => {
  const source = ctx.texts?.[slot]?.trim() || defaultSlotText(key, slot);
  return depouiller(applyJourneyVars(source, journeyVarValues(ctx)))
    .replace(/\s*\n\s*/g, " ")
    .trim();
};

const texte = (ctx: JourneyEmailContext, key: string, slot: string): string => {
  const source = ctx.texts?.[slot]?.trim() || defaultSlotText(key, slot);
  return escape(depouiller(applyJourneyVars(source, journeyVarValues(ctx))));
};

/**
 * ⚠️ `timeZone` n'est pas décoratif : il fait la différence entre le rendez-vous
 * du client et un autre.
 *
 * Les créneaux sont raisonnés en heure de Paris puis stockés en UTC (voir
 * scheduling.ts), et les fonctions Vercel tournent en UTC. Sans fuseau explicite,
 * une session de 10:00 était donc annoncée « 08:00 » au client et au partenaire,
 * pendant que l'alerte interne — qui, elle, précisait Europe/Paris — affichait la
 * bonne heure. Personne ne voyait l'écart depuis un poste réglé sur Paris : c'est
 * pour cela que le banc de test tourne en UTC (tests/setup-tz.ts).
 */
const frDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        timeZone: PARIS,
        weekday: "long",
        day: "2-digit",
        month: "long",
      })
    : null;

const frDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        timeZone: PARIS,
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** Bouton d'action principal. Un seul par e-mail — c'est la règle. */
const button = (label: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td>
     <a href="${url}" style="display:inline-block;padding:13px 26px;background:#fe5464;border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${label}</a>
   </td></tr></table>`;

/** Liste à puces sobre — pour les « trois choses à faire ». */
const bullets = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;">${items
    .map(
      (i) =>
        `<tr><td style="padding:3px 10px 3px 0;font-family:${FONT};font-size:15px;color:#fe5464;vertical-align:top;">•</td>
          <td style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:#4a4d57;">${i}</td></tr>`,
    )
    .join("")}</table>`;

/**
 * Échéance mise en avant. Une date noyée dans une phrase se lit sans se
 * retenir ; isolée et colorée, elle devient l'information qu'on retient.
 */
const deadlineBox = (dateLabel: string, why: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 18px;"><tr>
     <td style="padding:16px 20px;background:#fff0f1;border-left:4px solid #fe5464;border-radius:10px;font-family:${FONT};">
       <span style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};font-weight:700;">À compléter avant le</span>
       <span style="display:block;margin:2px 0 6px;font-size:22px;font-weight:800;color:#fe5464;">${dateLabel}</span>
       <span style="display:block;font-size:14px;line-height:1.55;color:#4a4d57;">${why}</span>
     </td>
   </tr></table>`;

/** Encadré discret pour une information de contexte (dates, modalité…). */
const callout = (html: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px;"><tr>
     <td style="padding:14px 18px;background:${OUTER};border:1px solid ${BORDER};border-radius:10px;font-family:${FONT};font-size:14px;line-height:1.6;color:#4a4d57;">${html}</td>
   </tr></table>`;

/**
 * Signature d'ÉQUIPE, jamais nominative.
 *
 * Un message signé d'un nom crée une attente de réponse personnelle et vieillit
 * mal : la personne change de poste, quitte l'entreprise, part en congés. Le
 * parcours dure des semaines et ses e-mails sont automatiques — ils engagent
 * l'équipe, pas quelqu'un en particulier.
 */
const TEAM = "L'équipe support TIM";

const signature = () =>
  `<p style="margin:18px 0 0;font-family:${FONT};font-size:15px;color:#4a4d57;">${TEAM}</p>`;

const textSignature = () => `\n\n${TEAM}`;

// ─── Messages au CLIENT ──────────────────────────────────────────────────────

const invitationEspaceClient = (ctx: JourneyEmailContext): BuiltEmail => {
  const start = frDate(ctx.startDate);
  const deadline = frDate(ctx.dossierDeadline);
  // Sans échéance connue, on ne fabrique pas une date : on garde la phrase
  // générale plutôt que d'annoncer un délai faux.
  const why = start
    ? `Ce délai nous laisse le temps de créer les comptes de vos équipes avant le démarrage, le ${start}.`
    : "Ce délai nous laisse le temps de créer les comptes de vos équipes avant le démarrage.";
  const intro = bloc(ctx, "invitation-espace-client", "intro");
  const listeIntro = bloc(ctx, "invitation-espace-client", "liste_intro");
  const encadre = bloc(ctx, "invitation-espace-client", "encadre");
  return {
    subject: sujet(ctx, "invitation-espace-client"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      listeIntro.text,
      "  • vos licences : qui utilisera TIM, avec quel rôle",
      "  • vos salariés, vos chantiers, vos véhicules et vos engins",
      "",
      encadre.text,
      "",
      ...(deadline
        ? [`À COMPLÉTER AVANT LE ${deadline.toUpperCase()}`, why, ""]
        : [
            `Sans ces informations, nous ne pouvons pas préparer vos accès${start ? ` avant le ${start}` : ""}.`,
            "",
          ]),
      PORTAL,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "invitation-espace-client", "titre"),
      preheader: texte(ctx, "invitation-espace-client", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(listeIntro.html) +
        bullets([
          "<strong>vos licences</strong> : qui utilisera TIM, et avec quel rôle",
          "vos <strong>salariés</strong>, vos <strong>chantiers</strong>, vos <strong>véhicules</strong> et vos <strong>engins</strong>",
        ]) +
        (deadline
          ? deadlineBox(deadline, why)
          : paragraph(
              `<span style="color:${MUTED};font-size:14px;">Sans ces informations, nous ne pouvons pas préparer vos accès${start ? ` avant le ${start}` : ""}.</span>`,
            )) +
        callout(encadre.html) +
        button(texte(ctx, "invitation-espace-client", "bouton"), PORTAL) +
        signature(),
    }),
  };
};

const codeConnexion = (ctx: JourneyEmailContext): BuiltEmail => {
  const code = ctx.code ?? "000000";
  const intro = bloc(ctx, "code-connexion", "intro");
  const validite = bloc(ctx, "code-connexion", "validite");
  const securite = bloc(ctx, "code-connexion", "securite");
  return {
    subject: sujet(ctx, "code-connexion"),
    text: [intro.text, "", code, "", validite.text, "", securite.text].join("\n"),
    html: shell({
      heading: texte(ctx, "code-connexion", "titre"),
      preheader: texte(ctx, "code-connexion", "apercu"),
      bodyHtml:
        paragraph(intro.html) +
        refBox("Code de connexion", code) +
        paragraph(validite.html) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${securite.html}</span>`),
    }),
  };
};

const dossierRecu = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "dossier-recu", "intro");
  const suite = bloc(ctx, "dossier-recu", "suite");
  const encadre = bloc(ctx, "dossier-recu", "encadre");
  return {
    subject: sujet(ctx, "dossier-recu"),
    text: [hello(ctx), "", intro.text, "", suite.text, "", encadre.text, textSignature()].join("\n"),
    html: shell({
      heading: texte(ctx, "dossier-recu", "titre"),
      preheader: texte(ctx, "dossier-recu", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(suite.html) +
        callout(encadre.html) +
        signature(),
    }),
  };
};

/**
 * Relance : le créneau de prise en main n'est toujours pas réservé.
 *
 * Ton différent de l'invitation initiale — on ne réexplique pas ce qu'est la
 * session, on dit ce qu'il en coûte de ne pas l'avoir. Un client qui n'a pas
 * réagi au premier message ne réagira pas au même message répété.
 */
const relanceCreneau = (ctx: JourneyEmailContext): BuiltEmail => {
  const url = `${PORTAL}/prise-en-main`;
  const intro = bloc(ctx, "relance-creneau", "intro");
  const format = bloc(ctx, "relance-creneau", "format");
  const enjeu = bloc(ctx, "relance-creneau", "enjeu");
  return {
    subject: sujet(ctx, "relance-creneau"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      format.text,
      enjeu.text,
      "",
      "Il reste des créneaux :",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "relance-creneau", "titre"),
      preheader: texte(ctx, "relance-creneau", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(format.html) +
        button(texte(ctx, "relance-creneau", "bouton"), url) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${enjeu.html}</span>`) +
        signature(),
    }),
  };
};

/**
 * Relance : le dossier de démarrage n'est pas transmis.
 *
 * Le message dit la CONSÉQUENCE, pas la consigne : sans dossier, pas de comptes
 * créés le lundi matin. C'est ce qui fait agir, pas un rappel de règlement.
 */
const relanceDossier = (ctx: JourneyEmailContext): BuiltEmail => {
  // Pas de date limite ici, contrairement à l'invitation : la relance part APRÈS
  // l'échéance annoncée (−3 j contre −5 j). Lui répéter « à compléter avant le
  // 26 » le 28 la décrédibiliserait. Le repère utile est devenu le démarrage.
  const url = `${PORTAL}/dossier`;
  const intro = bloc(ctx, "relance-dossier", "intro");
  const enjeu = bloc(ctx, "relance-dossier", "enjeu");
  const note = bloc(ctx, "relance-dossier", "note");
  return {
    subject: sujet(ctx, "relance-dossier"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      enjeu.text,
      "",
      note.text,
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "relance-dossier", "titre"),
      preheader: texte(ctx, "relance-dossier", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(enjeu.html) +
        button(texte(ctx, "relance-dossier", "bouton"), url) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${note.html}</span>`) +
        signature(),
    }),
  };
};

const priseEnMain = (ctx: JourneyEmailContext): BuiltEmail => {
  const url = `${PORTAL}/prise-en-main`;
  const intro = bloc(ctx, "prise-en-main", "intro");
  const format = bloc(ctx, "prise-en-main", "format");
  const note = bloc(ctx, "prise-en-main", "note");
  return {
    subject: sujet(ctx, "prise-en-main"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      format.text,
      "",
      note.text,
      "",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "prise-en-main", "titre"),
      preheader: texte(ctx, "prise-en-main", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(format.html) +
        button(texte(ctx, "prise-en-main", "bouton"), url) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${note.html}</span>`) +
        signature(),
    }),
  };
};

const accesPrets = (ctx: JourneyEmailContext): BuiltEmail => {
  const url = `${PORTAL}/acces`;
  const intro = bloc(ctx, "acces-prets", "intro");
  const quiDistribue = bloc(ctx, "acces-prets", "qui_distribue");
  const encadre = bloc(ctx, "acces-prets", "encadre");
  const note = bloc(ctx, "acces-prets", "note");
  return {
    subject: sujet(ctx, "acces-prets"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      quiDistribue.text,
      "",
      encadre.text,
      "",
      note.text,
      "",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "acces-prets", "titre"),
      preheader: texte(ctx, "acces-prets", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(quiDistribue.html) +
        callout(encadre.html) +
        button(texte(ctx, "acces-prets", "bouton"), url) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${note.html}</span>`) +
        signature(),
    }),
  };
};

const suiviChantier = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "suivi-chantier", "intro");
  return {
  subject: sujet(ctx, "suivi-chantier"),
  text: [
    hello(ctx),
    "",
    intro.text,
    "",
    "  1. Créez votre chantier (nom, adresse, dates)",
    "  2. Affectez-y vos équipes",
    "  3. Vos compagnons pointent dessus depuis leur téléphone",
    "",
    `${SITE_URL}/features`,
    textSignature(),
  ].join("\n"),
  html: shell({
    heading: texte(ctx, "suivi-chantier", "titre"),
    preheader: texte(ctx, "suivi-chantier", "apercu"),
    bodyHtml:
      paragraph(hello(ctx)) +
      paragraph(intro.html) +
      bullets([
        "Créez votre chantier : nom, adresse, dates",
        "Affectez-y vos équipes",
        "Vos compagnons pointent dessus depuis leur téléphone",
      ]) +
      button(texte(ctx, "suivi-chantier", "bouton"), `${SITE_URL}/features`) +
      signature(),
  }),
  };
};

/**
 * Les cinq visages : répondre sans avoir à rédiger.
 *
 * « Répondez à cet e-mail » suppose de trouver quoi écrire, et c'est
 * exactement l'effort qui fait qu'on ne répond pas. Un clic, lui, coûte une
 * seconde — et une réponse tiède vaut mieux qu'un silence dont on ne sait pas
 * s'il veut dire « tout va bien » ou « on a laissé tomber ».
 *
 * En TABLEAU et non en flex : les messageries (Outlook en tête) ignorent la
 * mise en page moderne, et cinq visages empilés en colonne ne se lisent plus
 * comme une échelle. Le libellé sous chaque visage parce qu'un emoji ne se rend
 * pas partout — mal affiché, il reste un mot cliquable.
 */
const smileyLinks = (runId: number | string) =>
  SATISFACTION_LEVELS.map((level) => ({ ...level, url: satisfactionUrl(SITE_URL, runId, level.value) }))
    .filter((l): l is typeof l & { url: string } => l.url !== null);

const smileys = (links: { emoji: string; label: string; url: string }[]): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr>` +
  links
    .map(
      (level) =>
        `<td style="padding:0 6px 0 0;text-align:center;">` +
        `<a href="${level.url}" style="display:inline-block;padding:10px 12px;border:1px solid ${BORDER};border-radius:10px;text-decoration:none;color:${MUTED};font-family:${FONT};font-size:11px;line-height:1.3;min-width:56px;">` +
        `<span style="font-size:26px;line-height:1.2;">${level.emoji}</span><br>${escape(level.label)}` +
        `</a></td>`,
    )
    .join("") +
  `</tr></table>`;

const checkIn = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "check-in", "intro");
  const question = bloc(ctx, "check-in", "question");
  const dispo = bloc(ctx, "check-in", "dispo");
  const reponse = bloc(ctx, "check-in", "reponse");
  const links = ctx.runId != null ? smileyLinks(ctx.runId) : [];
  return {
    subject: sujet(ctx, "check-in"),
    text: [
      hello(ctx),
      "",
      intro.text,
      ...(links.length > 0
        ? ["", question.text, ...links.map((l) => `  ${l.emoji} ${l.label} : ${l.url}`)]
        : []),
      "",
      dispo.text,
      "",
      reponse.text,
      textSignature(),
    ].join("\n"),
    // Volontairement dépouillé : pas de bouton, pas d'encadré. Un e-mail qui
    // ressemble à une campagne n'obtient pas de réponse ; celui-ci en attend une.
    // Et il ne présume rien : demander « qu'est-ce qui coince ? » à quelqu'un dont
    // tout va bien, c'est lui donner une question à laquelle il n'a pas de réponse.
    html: shell({
      heading: texte(ctx, "check-in", "titre"),
      preheader: texte(ctx, "check-in", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        (links.length > 0 ? paragraph(question.html) + smileys(links) : "") +
        paragraph(dispo.html) +
        paragraph(reponse.html) +
        signature(),
    }),
  };
};

const finProche = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "fin-proche", "intro");
  const bilan = bloc(ctx, "fin-proche", "bilan");
  const encadre = bloc(ctx, "fin-proche", "encadre");
  // Le client CHOISIT son créneau, au lieu de proposer deux dates et d'attendre.
  // La page décide de ce qu'elle montre : les créneaux du partenaire, ou son
  // propre lien de prise de rendez-vous quand il en utilise un.
  const url = `${PORTAL}/bilan`;
  return {
    subject: sujet(ctx, "fin-proche"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      bilan.text,
      "",
      url,
      "",
      encadre.text,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "fin-proche", "titre"),
      preheader: texte(ctx, "fin-proche", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        paragraph(bilan.html) +
        button(texte(ctx, "fin-proche", "bouton"), url) +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${encadre.html}</span>`) +
        signature(),
    }),
  };
};

const dernierJour = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "dernier-jour", "intro");
  const encadre = bloc(ctx, "dernier-jour", "encadre");
  return {
    subject: sujet(ctx, "dernier-jour"),
    text: [hello(ctx), "", intro.text, "", encadre.text, textSignature()].join("\n"),
    html: shell({
      heading: texte(ctx, "dernier-jour", "titre"),
      preheader: texte(ctx, "dernier-jour", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) + paragraph(intro.html) + callout(encadre.html) + signature(),
    }),
  };
};

/**
 * Les trois réponses, en TROIS BOUTONS.
 *
 * Une liste à puces demandait d'écrire un message pour dire laquelle. Or c'est
 * la réponse la plus utile du parcours — celle qui décide de la suite — et
 * c'est celle qu'on obtenait le moins : rédiger « je m'arrête » à quelqu'un
 * qu'on a eu au téléphone coûte plus qu'un clic.
 *
 * Empilés et non côte à côte : trois boutons alignés sur une messagerie
 * étroite se replient n'importe comment, et celui du milieu finit seul sur sa
 * ligne. Le premier est plein, les deux autres bordés — non pour orienter la
 * réponse, mais parce que trois boutons de même poids ne se lisent plus comme
 * un choix.
 */
const decisionBoutons = (links: { label: string; url: string; premier: boolean }[]): string =>
  links
    .map(
      (l) =>
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr><td>` +
        `<a href="${l.url}" style="display:inline-block;padding:12px 24px;border-radius:9px;` +
        (l.premier
          ? `background:#fe5464;color:#ffffff;border:1px solid #fe5464;`
          : `background:#ffffff;color:${INK};border:1px solid ${BORDER};`) +
        `font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${escape(l.label)}</a>` +
        `</td></tr></table>`,
    )
    .join("");

const decision = (ctx: JourneyEmailContext): BuiltEmail => {
  const intro = bloc(ctx, "decision", "intro");
  const encadre = bloc(ctx, "decision", "encadre");
  const reponse = bloc(ctx, "decision", "reponse");
  const token = ctx.runId != null ? safeRunToken("decision", ctx.runId) : null;
  const links = token
    ? CLIENT_DECISIONS.map((d, i) => ({
        label: d.label,
        url: `${SITE_URL.replace(/\/$/, "")}/decision/${token}?choix=${d.value}`,
        premier: i === 0,
      }))
    : [];

  return {
    subject: sujet(ctx, "decision"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      ...(links.length > 0
        ? links.map((l) => `  ${l.label} : ${l.url}`)
        : CLIENT_DECISIONS.map((d) => `  • ${d.label}`)),
      "",
      encadre.text,
      "",
      reponse.text,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: texte(ctx, "decision", "titre"),
      preheader: texte(ctx, "decision", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        (links.length > 0
          ? decisionBoutons(links)
          : bullets(CLIENT_DECISIONS.map((d) => escape(d.label)))) +
        callout(encadre.html) +
        paragraph(reponse.html) +
        signature(),
    }),
  };
};

/**
 * Les participants annoncés, en lignes lisibles.
 *
 * Une seule fonction pour les deux messages : le partenaire et le client doivent
 * voir exactement la même liste, sinon l'un des deux se présentera avec une
 * information que l'autre n'a pas.
 */
function attendeeLines(ctx: JourneyEmailContext): string[] {
  const a = ctx.sessionAttendee;
  const lines: string[] = [];

  if (a) {
    const who = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
    const parts = [who || a.email, a.role ? `(${a.role})` : null, a.email && who ? `— ${a.email}` : null];
    lines.push(parts.filter(Boolean).join(" "));
  }

  for (const g of ctx.sessionGuests ?? []) {
    if (!g?.email) continue;
    lines.push(g.name ? `${g.name} — ${g.email}` : g.email);
  }
  return lines;
}

/**
 * Confirmation au CLIENT du créneau qu'il vient de réserver.
 *
 * Il n'existait pas : seul le partenaire était prévenu, et le client n'était
 * qu'un invité de l'événement d'agenda — donc prévenu uniquement si le
 * partenaire avait connecté son calendrier. Réserver un rendez-vous et ne rien
 * recevoir laisse un doute que rien ne lève, et pousse à réserver deux fois.
 *
 * Le lien de visio est écrit EN TOUTES LETTRES quand il existe : « lien fourni »
 * oblige le client à le chercher ailleurs, le jour même, cinq minutes avant.
 */
const creneauConfirme = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.sessionAt);
  const link = ctx.sessionLink?.trim() || null;
  const intro = bloc(ctx, "creneau-confirme", "intro");
  const preparation = bloc(ctx, "creneau-confirme", "preparation");
  return {
    subject: sujet(ctx, "creneau-confirme"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      when ? `Quand : ${when}` : "",
      `Durée : 45 minutes`,
      ctx.sessionModality ? `Où    : ${ctx.sessionModality}` : "",
      link ? `Lien  : ${link}` : "",
      "",
      ...(attendeeLines(ctx).length
        ? ["Invités à cette session :", ...attendeeLines(ctx).map((l) => `  • ${l}`), ""]
        : []),
      preparation.text,
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: texte(ctx, "creneau-confirme", "titre"),
      preheader: texte(ctx, "creneau-confirme", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        callout(
          [
            when ? `<strong>${when}</strong>` : null,
            "45 minutes",
            ctx.sessionModality ? escape(ctx.sessionModality) : null,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (link ? button("Rejoindre la visio", link) : "") +
        (attendeeLines(ctx).length
          ? paragraph(
              `<strong>Invités à cette session</strong><br>${attendeeLines(ctx).map(escape).join("<br>")}`,
            )
          : "") +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${preparation.html}</span>`) +
        signature(),
    }),
  };
};

/**
 * Rappel la veille du créneau, à 17 h.
 *
 * Il ne redit pas ce que la confirmation disait déjà : il sert à ce que le
 * rendez-vous soit tenu. Donc l'heure, le lien, et ce qu'il faut avoir sous la
 * main — parce qu'une session où l'on découvre qu'il manque le dossier ou que
 * personne n'a le bon ordinateur est une session perdue pour tout le monde.
 */
const rappelCreneau = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.sessionAt);
  const link = ctx.sessionLink?.trim() || null;
  const intro = bloc(ctx, "rappel-creneau", "intro");
  const preparation = bloc(ctx, "rappel-creneau", "preparation");
  return {
    subject: sujet(ctx, "rappel-creneau"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "Comptez 45 minutes.",
      ctx.sessionModality ? `Où   : ${ctx.sessionModality}` : "",
      link ? `Lien : ${link}` : "",
      "",
      ...(attendeeLines(ctx).length
        ? ["Attendus à cette session :", ...attendeeLines(ctx).map((l) => `  • ${l}`), ""]
        : []),
      preparation.text,
      "",
      "Un empêchement ? Répondez à cet e-mail, on replacera le rendez-vous.",
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: texte(ctx, "rappel-creneau", "titre"),
      preheader: texte(ctx, "rappel-creneau", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        // L'introduction manquait ICI : réécrite, elle ne changeait que la
        // version texte, et les deux versions du même message se contredisaient.
        paragraph(intro.html) +
        callout(
          [
            when ? `<strong>${when}</strong>` : "<strong>Demain</strong>",
            "45 minutes",
            ctx.sessionModality ? escape(ctx.sessionModality) : null,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (link ? button("Rejoindre la visio", link) : "") +
        (attendeeLines(ctx).length
          ? paragraph(
              `<strong>Attendus à cette session</strong><br>${attendeeLines(ctx).map(escape).join("<br>")}`,
            )
          : "") +
        paragraph(preparation.html) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Un empêchement&nbsp;? Répondez à cet e-mail, on replacera le rendez-vous.</span>`,
        ) +
        signature(),
    }),
  };
};

/**
 * Le bilan est réservé, et le rappel de la veille.
 *
 * Deux messages jumeaux de ceux de la prise en main, et volontairement plus
 * courts : à ce stade le client connaît son interlocuteur, il n'y a rien à
 * réexpliquer. Ce qu'il lui faut tient en trois lignes — quand, combien de
 * temps, et par où entrer.
 */
const bilanConfirme = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.reviewAt);
  const link = ctx.reviewLink?.trim() || null;
  const intro = bloc(ctx, "bilan-confirme", "intro");
  const preparation = bloc(ctx, "bilan-confirme", "preparation");
  return {
    subject: sujet(ctx, "bilan-confirme"),
    text: [
      hello(ctx),
      "",
      intro.text,
      "",
      when ? `Quand : ${when}` : "",
      `Durée : ${REVIEW_DURATION_MIN} minutes`,
      ctx.sessionModality ? `Où    : ${ctx.sessionModality}` : "",
      link ? `Lien  : ${link}` : "",
      "",
      preparation.text,
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: texte(ctx, "bilan-confirme", "titre"),
      preheader: texte(ctx, "bilan-confirme", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        callout(
          [
            when ? `<strong>${when}</strong>` : null,
            `${REVIEW_DURATION_MIN} minutes`,
            ctx.sessionModality ? escape(ctx.sessionModality) : null,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (link ? button("Rejoindre la visio", link) : "") +
        paragraph(`<span style="color:${MUTED};font-size:14px;">${preparation.html}</span>`) +
        signature(),
    }),
  };
};

const rappelBilan = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.reviewAt);
  const link = ctx.reviewLink?.trim() || null;
  const intro = bloc(ctx, "rappel-bilan", "intro");
  const preparation = bloc(ctx, "rappel-bilan", "preparation");
  return {
    subject: sujet(ctx, "rappel-bilan"),
    text: [
      hello(ctx),
      "",
      intro.text,
      `Comptez ${REVIEW_DURATION_MIN} minutes.`,
      ctx.sessionModality ? `Où   : ${ctx.sessionModality}` : "",
      link ? `Lien : ${link}` : "",
      "",
      preparation.text,
      "",
      "Un empêchement ? Répondez à cet e-mail, on replacera le rendez-vous.",
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: texte(ctx, "rappel-bilan", "titre"),
      preheader: texte(ctx, "rappel-bilan", "apercu"),
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(intro.html) +
        callout(
          [
            when ? `<strong>${when}</strong>` : "<strong>Demain</strong>",
            `${REVIEW_DURATION_MIN} minutes`,
            ctx.sessionModality ? escape(ctx.sessionModality) : null,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (link ? button("Rejoindre la visio", link) : "") +
        paragraph(preparation.html) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Un empêchement&nbsp;? Répondez à cet e-mail, on replacera le rendez-vous.</span>`,
        ) +
        signature(),
    }),
  };
};

// ─── Messages au PARTENAIRE ──────────────────────────────────────────────────

const creneauReserve = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.sessionAt);
  const intro = bloc(ctx, "creneau-reserve", "intro");
  const preparation = bloc(ctx, "creneau-reserve", "preparation");
  return {
    subject: sujet(ctx, "creneau-reserve"),
    text: [
      intro.text,
      "",
      when ? `Quand : ${when}` : "",
      ctx.sessionModality ? `Où   : ${ctx.sessionModality}` : "",
      "",
      ...(attendeeLines(ctx).length
        ? ["Seront présents :", ...attendeeLines(ctx).map((l) => `  • ${l}`), ""]
        : []),
      preparation.text,
    ]
      .filter(Boolean)
      .join("\n"),
    html: shell({
      heading: texte(ctx, "creneau-reserve", "titre"),
      preheader: texte(ctx, "creneau-reserve", "apercu"),
      bodyHtml:
        paragraph(intro.html) +
        callout(
          [
            when ? `<strong>${when}</strong>` : null,
            ctx.sessionModality ? escape(ctx.sessionModality) : null,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (attendeeLines(ctx).length
          ? paragraph(
              `<strong>Seront présents</strong><br>${attendeeLines(ctx).map(escape).join("<br>")}`,
            )
          : "") +
        paragraph(preparation.html),
    }),
  };
};

const recapPartenaire = (ctx: JourneyEmailContext): BuiltEmail => {
  const runs = ctx.partnerRuns ?? [];
  const url = `${SITE_URL}/admin/collections/journey-runs`;

  // Le compte à rebours passe avant le nom de l'étape : c'est lui qui dit s'il
  // faut agir cette semaine ou pas.
  const ligne = (r: NonNullable<JourneyEmailContext["partnerRuns"]>[number]) => {
    const reste =
      r.daysLeft == null
        ? null
        : r.daysLeft < 0
          ? "test terminé"
          : r.daysLeft === 0
            ? "dernier jour"
            : `${r.daysLeft} jour${r.daysLeft > 1 ? "s" : ""} restant${r.daysLeft > 1 ? "s" : ""}`;
    return [reste, r.currentStep].filter(Boolean).join(" — ");
  };

  return {
    subject:
      runs.length === 1
        ? `Phase de test en cours : ${runs[0].clientName}`
        : `Vos ${runs.length} phases de test en cours`,
    text: [
      "Voici où en sont vos phases de test cette semaine.",
      "",
      ...runs.map((r) => `• ${r.clientName} — ${ligne(r) || "en préparation"}`),
      "",
      "Le détail, client par client :",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Vos phases de test cette semaine",
      preheader: runs.map((r) => r.clientName).join(", ") || "Le point de la semaine.",
      bodyHtml:
        paragraph("Voici où en sont vos phases de test cette semaine.") +
        (runs.length
          ? bullets(
              runs.map(
                (r) =>
                  `<strong>${escape(r.clientName)}</strong>${
                    ligne(r) ? ` — ${escape(ligne(r))}` : ""
                  }`,
              ),
            )
          : paragraph("Aucune phase de test en cours pour le moment.")) +
        button("Ouvrir mes phases de test", url) +
        signature(),
    }),
  };
};

// ─── Registre ────────────────────────────────────────────────────────────────
/**
 * Les gabarits rédigés, par clé d'envoi.
 *
 * Les envois INTERNES (Go/No-Go, devis, dossier à vérifier, demande de contrat)
 * ne sont pas ici : ils vivent dans `notify.ts`, avec leur enveloppe sobre et
 * leurs données de décision.
 */
/**
 * Accès TIM d'UNE personne, envoyé à son adresse.
 *
 * Envoyé par TIM, jamais par le client : c'est notre nom sur l'expéditeur, donc
 * notre responsabilité que le message ressemble à ce qu'il est et pas à une
 * tentative d'hameçonnage — d'où le nom de l'entreprise en toutes lettres et
 * aucune demande de cliquer quoi que ce soit pour « vérifier » son compte.
 *
 * ⚠️ Ce message contient un mot de passe en clair. C'est un compromis assumé :
 * la remise en main propre reste la voie recommandée (la page « Mes accès »
 * s'imprime et se découpe), mais un compagnon en déplacement n'a personne pour
 * lui tendre un papier. L'envoi est donc déclenché ligne par ligne, par le
 * client, et va TOUJOURS à l'adresse déclarée pour cette personne — jamais à
 * une adresse saisie au moment de l'envoi.
 */
/** Le logiciel TIM lui-même — là où ces identifiants servent. */
const TIM_APP_URL = "https://app.tim-management.co/";
const TIM_ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.timmanagement.app";
const TIM_IOS_URL = "https://apps.apple.com/fr/app/tim-management/id1565369001";

/**
 * Qui accède à quoi. Les deux listes ne se recoupent qu'en partie, et c'est le
 * cœur du message : proposer une porte fermée est pire que ne rien proposer.
 *
 *  - le NAVIGATEUR va à ceux qui paramètrent et qui suivent — administrateur,
 *    conducteur de travaux, chef de chantier. Les autres n'y ont tout
 *    simplement pas de compte : leur envoyer « Se connecter à TIM » les
 *    enverrait se heurter à un refus, et douter de leurs identifiants ;
 *  - l'APPLICATION MOBILE va à ceux qui sont sur le terrain — chef de chantier,
 *    chef d'équipe, compagnon : c'est sur un téléphone, au pied du chantier,
 *    que le pointage se saisit.
 *
 * Le chef de chantier est donc le seul à recevoir les deux : il prépare devant
 * un écran et pointe sur le chantier.
 *
 * Un profil inconnu reçoit le lien web, comme un administrateur : c'est le cas
 * d'un compte de direction créé hors nomenclature, et le priver du lien serait
 * plus gênant que l'inverse.
 */
const WEB_PROFILES = new Set(["admin", "conducteur", "chefChantier"]);
const MOBILE_PROFILES = new Set(["chefChantier", "chefEquipe", "compagnon"]);

/** Les portes ouvertes à un profil. Une seule table, deux messages. */
const channelsOf = (profileKey?: string | null) => ({
  web: !profileKey || WEB_PROFILES.has(profileKey),
  mobile: MOBILE_PROFILES.has(profileKey ?? ""),
});

/** La page où le client imprime et renvoie les accès, un par un. */
const PORTAL_ACCES = `${PORTAL}/acces`;

/** « Connexion : … » — la ligne qui dit à CETTE personne par où elle entre. */
const channelLine = (profileKey: string | null | undefined, html: boolean): string => {
  const { web, mobile } = channelsOf(profileKey);
  if (html) {
    const app = `<a href="${TIM_ANDROID_URL}">Android</a> · <a href="${TIM_IOS_URL}">iPhone</a>`;
    if (web && mobile)
      return `Connexion&nbsp;: <a href="${TIM_APP_URL}">le logiciel en ligne</a>, ou l'application mobile (${app})`;
    if (web) return `Connexion&nbsp;: <a href="${TIM_APP_URL}">le logiciel en ligne</a>`;
    return `Connexion&nbsp;: application mobile (${app})`;
  }
  if (web && mobile)
    return `  Connexion     : ${TIM_APP_URL}\n  ou l'app mobile : ${TIM_ANDROID_URL} (Android) / ${TIM_IOS_URL} (iPhone)`;
  if (web) return `  Connexion     : ${TIM_APP_URL}`;
  return `  Application   : ${TIM_ANDROID_URL} (Android) / ${TIM_IOS_URL} (iPhone)`;
};

/**
 * Badges officiels des deux magasins.
 *
 * Servis par Google et Apple, qui les maintiennent aux bonnes dimensions et
 * dans la bonne langue. La plupart des messageries bloquent les images tant que
 * le destinataire ne les autorise pas : le texte de remplacement porte donc le
 * nom du magasin, et le lien reste cliquable même sans image.
 */
const PLAY_BADGE =
  "https://play.google.com/intl/fr_fr/badges/static/images/badges/fr_badge_web_generic.png";
const APPSTORE_BADGE =
  "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr?size=250x83";

/**
 * TOUS les accès d'une entreprise, en un seul message.
 *
 * Envoyé au référent — celui qui distribuera les identifiants à ses équipes —
 * quand il est plus simple de lui remettre la liste que d'écrire à neuf
 * personnes. Le message individuel (`buildTimAccessEmail`) garde son rôle : il
 * s'adresse à la personne, celui-ci à celle qui organise.
 *
 * Il rappelle aussi que ces identifiants vivent dans l'espace client : un
 * e-mail se perd, se classe, s'efface — l'espace, lui, reste, et n'oblige pas à
 * demander qu'on renvoie la liste.
 *
 * ⚠️ Un seul message porte ici TOUS les mots de passe. C'est ce qui est demandé
 * — remettre la liste à celui qui la distribue — mais ça reste un message qui
 * se transfère : la phrase de prudence en fin de mail n'est pas décorative.
 */
export const buildTimAccessRecapEmail = (args: {
  clientName?: string | null;
  contactFirstName?: string | null;
  accesses: {
    firstName?: string | null;
    lastName?: string | null;
    login: string;
    password: string;
    profileLabel?: string | null;
    profileKey?: string | null;
  }[];
}): BuiltEmail => {
  const who = args.contactFirstName?.trim()
    ? `Bonjour ${args.contactFirstName.trim()},`
    : "Bonjour,";
  const societe = args.clientName?.trim();
  const count = args.accesses.length;
  const nameOf = (a: { firstName?: string | null; lastName?: string | null }) =>
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim();

  /**
   * Rangés par NIVEAU, et regroupés sous leur intitulé — comme l'espace client
   * et la feuille d'impression.
   *
   * Une liste continue mélange un compagnon entre deux conducteurs, et celui qui
   * distribue doit relire chaque ligne pour savoir à qui il parle. Les trois
   * supports montrent donc le même ordre, ce qui permet de les recouper.
   *
   * Le tri se refait ici plutôt que de se fier à l'appelant : ce constructeur
   * est aussi appelé par les tests et pourrait l'être ailleurs.
   */
  const groups: { label: string; gens: typeof args.accesses }[] = [];
  for (const a of [...args.accesses].sort(
    (x, y) =>
      profileRank(x.profileKey) - profileRank(y.profileKey) ||
      (x.lastName ?? "").localeCompare(y.lastName ?? "", "fr"),
  )) {
    const label = a.profileLabel?.trim() || "Profil non précisé";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.gens.push(a);
    else groups.push({ label, gens: [a] });
  }

  return {
    subject:
      count > 1 ? `Les ${count} accès au logiciel TIM` : "Les accès au logiciel TIM",
    text: [
      who,
      "",
      societe
        ? `Voici ${count > 1 ? `les ${count} accès` : "l'accès"} au logiciel TIM pour ${societe}.`
        : `Voici ${count > 1 ? `les ${count} accès` : "l'accès"} au logiciel TIM.`,
      "",
      "Vous les retrouvez à tout moment dans votre espace client :",
      PORTAL_ACCES,
      "Vous pouvez y imprimer chaque fiche et renvoyer à chacun ses identifiants, un par un,",
      "sans repasser par nous.",
      "",
      ...groups.flatMap((g) => [
        `${g.label.toUpperCase()}`,
        // La porte d'entrée se dit une fois par niveau, pas une fois par
        // personne : elle ne dépend que du profil. Le lien du logiciel ne sert
        // à rien à un compagnon, les magasins à rien à un administrateur.
        channelLine(g.gens[0]?.profileKey, false),
        "",
        ...g.gens.flatMap((a) => [
          nameOf(a) || a.login,
          `  Identifiant   : ${a.login}`,
          `  Mot de passe  : ${a.password}`,
          "",
        ]),
      ]),
      "Ces mots de passe sont personnels : transmettez à chacun le sien, et rien de plus.",
      textSignature(),
    ]
      // Les lignes vides sont GARDÉES ici : ce sont elles qui séparent les
      // niveaux et les personnes. Sans elles, la version texte devient un pavé
      // où l'on ne retrouve plus à qui appartient un mot de passe.
      .join("\n"),
    html: shell({
      heading: count > 1 ? `Les ${count} accès au logiciel TIM` : "Les accès au logiciel TIM",
      preheader: "Les identifiants de vos équipes, et où les retrouver.",
      bodyHtml:
        paragraph(who) +
        paragraph(
          societe
            ? `Voici ${count > 1 ? `les <strong>${count} accès</strong>` : "l'accès"} au logiciel TIM pour <strong>${escape(societe)}</strong>.`
            : `Voici ${count > 1 ? `les <strong>${count} accès</strong>` : "l'accès"} au logiciel TIM.`,
        ) +
        // En TÊTE, avant même la liste : l'espace client est ce qui reste quand
        // ce message a été classé ou perdu, et c'est de là qu'on réimprime une
        // fiche ou qu'on renvoie ses accès à une seule personne.
        paragraph(
          `Vous les retrouvez à tout moment dans votre <a href="${PORTAL_ACCES}">espace client</a>&nbsp;: ` +
            `vous pouvez y <strong>imprimer chaque fiche</strong> et <strong>renvoyer à chacun ses identifiants</strong>, ` +
            `un par un, sans repasser par nous.`,
        ) +
        button("Ouvrir mon espace client", PORTAL_ACCES) +
        groups
          .map(
            (g) =>
              // L'intitulé du niveau, et la porte qui va avec : elle ne dépend
              // que du profil — voir WEB_PROFILES.
              paragraph(
                `<strong>${escape(g.label)}</strong><br>` +
                  `<span style="color:${MUTED};font-size:14px;">${channelLine(g.gens[0]?.profileKey, true)}</span>`,
              ) +
              g.gens
                .map((a) =>
                  callout(
                    [
                      nameOf(a) ? `<strong>${escape(nameOf(a))}</strong>` : null,
                      `Identifiant&nbsp;: <strong>${escape(a.login)}</strong>`,
                      `Mot de passe&nbsp;: <strong>${escape(a.password)}</strong>`,
                    ]
                      .filter(Boolean)
                      .join("<br>"),
                  ),
                )
                .join(""),
          )
          .join("") +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Ces mots de passe sont personnels&nbsp;: transmettez à chacun le sien, et rien de plus.</span>`,
        ) +
        signature(),
    }),
  };
};

export const buildTimAccessEmail = (args: {
  firstName?: string | null;
  lastName?: string | null;
  login: string;
  password: string;
  profileLabel?: string | null;
  profileKey?: string | null;
  clientName?: string | null;
}): BuiltEmail => {
  const who = args.firstName?.trim() ? `Bonjour ${escape(args.firstName.trim())},` : "Bonjour,";
  const societe = args.clientName?.trim();
  const { mobile, web } = channelsOf(args.profileKey);

  return {
    subject: "Vos accès au logiciel TIM",
    text: [
      args.firstName?.trim() ? `Bonjour ${args.firstName.trim()},` : "Bonjour,",
      "",
      societe
        ? `${societe} vous a ouvert un accès au logiciel TIM.`
        : "Un accès au logiciel TIM vous a été ouvert.",
      args.profileLabel ? `Profil : ${args.profileLabel}` : "",
      "",
      `Identifiant   : ${args.login}`,
      `Mot de passe  : ${args.password}`,
      "",
      ...(web ? [`Connexion : ${TIM_APP_URL}`] : []),
      ...(mobile
        ? [
            "",
            web
              ? "Sur le chantier, l'application mobile :"
              : "Votre accès se fait depuis l'application mobile :",
            `  Android   : ${TIM_ANDROID_URL}`,
            `  iPhone    : ${TIM_IOS_URL}`,
          ]
        : []),
      "",
      "Ce mot de passe est personnel : ne le transmettez à personne.",
      "Si vous n'attendiez pas ce message, prévenez votre responsable.",
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: "Vos accès au logiciel TIM",
      preheader: "Votre identifiant et votre mot de passe.",
      bodyHtml:
        paragraph(who) +
        paragraph(
          societe
            ? `<strong>${escape(societe)}</strong> vous a ouvert un accès au logiciel TIM.`
            : "Un accès au logiciel TIM vous a été ouvert.",
        ) +
        callout(
          [
            args.profileLabel ? `${escape(args.profileLabel)}` : null,
            `Identifiant&nbsp;: <strong>${escape(args.login)}</strong>`,
            `Mot de passe&nbsp;: <strong>${escape(args.password)}</strong>`,
          ]
            .filter(Boolean)
            .join("<br>"),
        ) +
        (web ? button("Se connecter à TIM", TIM_APP_URL) : "") +
        (mobile
          ? paragraph(
              `<strong>${web ? "Sur le chantier, l'application mobile" : "Votre accès se fait depuis l'application mobile"}</strong><br>` +
                `<a href="${TIM_ANDROID_URL}" style="display:inline-block;margin:8px 8px 0 0;">` +
                `<img src="${PLAY_BADGE}" alt="Disponible sur Google Play" height="44" style="height:44px;border:0;"></a>` +
                `<a href="${TIM_IOS_URL}" style="display:inline-block;margin:8px 0 0 0;">` +
                `<img src="${APPSTORE_BADGE}" alt="Télécharger dans l'App Store" height="44" style="height:44px;border:0;"></a>`,
            )
          : "") +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Ce mot de passe est personnel&nbsp;: ne le transmettez à personne. Si vous n'attendiez pas ce message, prévenez votre responsable.</span>`,
        ) +
        signature(),
    }),
  };
};

export const JOURNEY_EMAILS: Record<
  string,
  (ctx: JourneyEmailContext) => BuiltEmail
> = {
  "invitation-espace-client": invitationEspaceClient,
  "code-connexion": codeConnexion,
  "dossier-recu": dossierRecu,
  "relance-creneau": relanceCreneau,
  "relance-dossier": relanceDossier,
  "prise-en-main": priseEnMain,
  "acces-prets": accesPrets,
  "suivi-chantier": suiviChantier,
  "check-in": checkIn,
  "fin-proche": finProche,
  "dernier-jour": dernierJour,
  decision,
  "creneau-confirme": creneauConfirme,
  "rappel-creneau": rappelCreneau,
  "creneau-reserve": creneauReserve,
  "bilan-confirme": bilanConfirme,
  "rappel-bilan": rappelBilan,
  "recap-partenaire": recapPartenaire,
};

export const hasTemplate = (key: string): boolean => key in JOURNEY_EMAILS;
