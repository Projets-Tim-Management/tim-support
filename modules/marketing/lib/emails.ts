import {
  BORDER,
  FONT,
  MUTED,
  OUTER,
  SITE_URL,
  escape,
  paragraph,
  refBox,
  shell,
} from "@/core/lib/email-template";

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

const company = (ctx: JourneyEmailContext) =>
  escape(ctx.clientName?.trim() || "votre entreprise");

const frDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      })
    : null;

const frDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
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
  return {
    subject: "Votre espace client TIM est ouvert",
    text: [
      hello(ctx),
      "",
      `Votre espace client est ouvert. C'est là que vous préparez la phase de test de ${ctx.clientName ?? "votre entreprise"}${start ? `, qui démarre le ${start}` : ""}.`,
      "",
      "Vous y renseignez, à votre rythme :",
      "  • vos licences : qui utilisera TIM, avec quel rôle",
      "  • vos salariés, vos chantiers, vos véhicules et vos engins",
      "",
      "Pas de mot de passe à retenir : vous saisissez votre e-mail, un code à 6 chiffres vous est envoyé.",
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
      heading: "Votre espace client est ouvert",
      preheader:
        "Renseignez vos informations pour préparer votre phase de test.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `Votre espace client est ouvert. C'est là que vous préparez la phase de test de <strong>${company(ctx)}</strong>${start ? `, qui démarre le <strong>${start}</strong>` : ""}.`,
        ) +
        paragraph("Vous y renseignez, à votre rythme :") +
        bullets([
          "<strong>vos licences</strong> : qui utilisera TIM, et avec quel rôle",
          "vos <strong>salariés</strong>, vos <strong>chantiers</strong>, vos <strong>véhicules</strong> et vos <strong>engins</strong>",
        ]) +
        (deadline
          ? deadlineBox(deadline, why)
          : paragraph(
              `<span style="color:${MUTED};font-size:14px;">Sans ces informations, nous ne pouvons pas préparer vos accès${start ? ` avant le ${start}` : ""}.</span>`,
            )) +
        callout(
          "Pas de mot de passe à retenir : vous saisissez votre adresse e-mail, un code à 6 chiffres vous est envoyé.",
        ) +
        button("Ouvrir mon espace client", PORTAL) +
        signature(),
    }),
  };
};

const codeConnexion = (ctx: JourneyEmailContext): BuiltEmail => {
  const code = ctx.code ?? "000000";
  return {
    subject: `${code} — votre code de connexion TIM`,
    text: [
      `Votre code de connexion à l'espace client${ctx.clientName ? ` de ${ctx.clientName}` : ""} :`,
      "",
      code,
      "",
      "Il est valable 15 minutes et ne fonctionne qu'une fois.",
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    ].join("\n"),
    html: shell({
      heading: "Votre code de connexion",
      preheader: `Code ${code} — valable 15 minutes.`,
      bodyHtml:
        paragraph(
          `Voici votre code pour accéder à l'espace client${ctx.clientName ? ` de <strong>${company(ctx)}</strong>` : ""}.`,
        ) +
        refBox("Code de connexion", code) +
        paragraph(
          "Il est valable <strong>15 minutes</strong> et ne fonctionne qu'une seule fois.",
        ) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : personne n'a pu accéder à votre espace.</span>`,
        ),
    }),
  };
};

const dossierRecu = (ctx: JourneyEmailContext): BuiltEmail => {
  const start = frDate(ctx.startDate);
  return {
    subject: "Nous avons bien reçu votre dossier",
    text: [
      hello(ctx),
      "",
      "Votre dossier de démarrage nous est bien parvenu. Merci.",
      "",
      `Nous préparons vos accès${start ? ` pour le ${start}` : ""}. Vous les recevrez le matin du démarrage, prêts à être imprimés et distribués à vos équipes.`,
      "",
      "Rien à faire de votre côté d'ici là.",
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Dossier bien reçu",
      preheader: "Nous préparons vos accès.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph("Votre dossier de démarrage nous est bien parvenu. Merci.") +
        paragraph(
          `Nous préparons vos accès${start ? ` pour le <strong>${start}</strong>` : ""}. Vous les recevrez le matin du démarrage, prêts à être imprimés et distribués à vos équipes.`,
        ) +
        callout("Rien à faire de votre côté d'ici là.") +
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
  const start = frDate(ctx.startDate);
  const url = `${PORTAL}/prise-en-main`;
  return {
    subject: "Il reste à réserver votre session de prise en main",
    text: [
      hello(ctx),
      "",
      `Votre test démarre${start ? ` le ${start}` : " dans quelques jours"}, et nous n'avons pas encore de créneau pour votre session de prise en main.`,
      "",
      "45 minutes avec l'administrateur de votre compte — celui qui pilotera TIM au quotidien.",
      "Les entreprises qui la font démarrent vraiment dès la première semaine ; les autres passent la leur à chercher comment faire.",
      "",
      "Il reste des créneaux :",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Il reste à réserver votre session de prise en main",
      preheader: "45 minutes, avant le démarrage — il reste des créneaux.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `Votre test démarre${start ? ` le <strong>${start}</strong>` : " dans quelques jours"}, et nous n'avons pas encore de créneau pour votre session de prise en main.`,
        ) +
        paragraph(
          "<strong>45 minutes</strong> avec l'administrateur de votre compte, celui qui pilotera TIM au quotidien.",
        ) +
        button("Choisir mon créneau", url) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Les entreprises qui font cette session démarrent dès la première semaine. Les autres passent la leur à chercher comment faire.</span>`,
        ) +
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
  const start = frDate(ctx.startDate);
  // Pas de date limite ici, contrairement à l'invitation : la relance part APRÈS
  // l'échéance annoncée (−3 j contre −5 j). Lui répéter « à compléter avant le
  // 26 » le 28 la décrédibiliserait. Le repère utile est devenu le démarrage.
  const url = `${PORTAL}/dossier`;
  return {
    subject: "Votre dossier de démarrage nous manque",
    text: [
      hello(ctx),
      "",
      "Nous n'avons pas encore reçu votre dossier de démarrage : vos salariés, vos chantiers, et votre matériel si vous en suivez.",
      "",
      `C'est ce qui nous permet de créer les comptes de vos équipes${start ? ` pour le ${start}` : " pour le démarrage"}. Sans lui, vos accès ne seront pas prêts le jour J.`,
      "",
      "Vous pouvez le remplir en plusieurs fois, il s'enregistre au fur et à mesure :",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Votre dossier de démarrage nous manque",
      preheader: "Sans lui, vos accès ne seront pas prêts pour le démarrage.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          "Nous n'avons pas encore reçu votre dossier de démarrage : vos salariés, vos chantiers, et votre matériel si vous en suivez.",
        ) +
        paragraph(
          `C'est ce qui nous permet de créer les comptes de vos équipes${start ? ` pour le <strong>${start}</strong>` : " pour le démarrage"}. Sans lui, vos accès ne seront pas prêts le jour J.`,
        ) +
        button("Compléter mon dossier", url) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Vous pouvez le remplir en plusieurs fois : chaque section s'enregistre au fur et à mesure.</span>`,
        ) +
        signature(),
    }),
  };
};

const priseEnMain = (ctx: JourneyEmailContext): BuiltEmail => {
  const start = frDate(ctx.startDate);
  const url = `${PORTAL}/prise-en-main`;
  return {
    subject: "45 minutes pour rendre votre équipe autonome",
    text: [
      hello(ctx),
      "",
      `Votre phase de test démarre${start ? ` le ${start}` : " bientôt"}. D'ici là, une seule chose à caler : la session de prise en main${ctx.sessionModality ? `, ${ctx.sessionModality}` : ""}.`,
      "",
      "45 minutes, avec l'administrateur de votre compte — celui qui pilotera TIM au quotidien.",
      "",
      "Elle doit avoir lieu AVANT le démarrage : c'est une préparation, pas un rattrapage.",
      "",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "45 minutes pour rendre votre équipe autonome",
      preheader: "Choisissez votre créneau de prise en main.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `Votre phase de test démarre${start ? ` le <strong>${start}</strong>` : " bientôt"}. D'ici là, une seule chose à caler : la session de prise en main${ctx.sessionModality ? `, ${escape(ctx.sessionModality)}` : ""}.`,
        ) +
        paragraph(
          "<strong>45 minutes</strong>, avec l'administrateur de votre compte, celui qui pilotera TIM au quotidien.",
        ) +
        button("Choisir mon créneau", url) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">La session a lieu <strong>avant</strong> le démarrage : c'est une préparation, pas un rattrapage.</span>`,
        ) +
        signature(),
    }),
  };
};

const accesPrets = (ctx: JourneyEmailContext): BuiltEmail => {
  const url = `${PORTAL}/acces`;
  const count = ctx.credentialCount ?? 0;
  return {
    subject: "Vos accès TIM sont prêts",
    text: [
      hello(ctx),
      "",
      `Les comptes de ${ctx.clientName ?? "votre entreprise"} sont créés${count ? ` : ${count} accès` : ""}. Votre phase de test commence aujourd'hui.`,
      "",
      "C'est vous qui les distribuez — vous savez mieux que nous qui doit commencer par quoi.",
      "",
      "Dans votre espace client, chaque personne a sa fiche : identifiant et code. Vous pouvez les imprimer et les découper pour les remettre en réunion de chantier.",
      "",
      "Les identifiants ne sont pas dans cet e-mail : ils ne s'affichent qu'une fois connecté.",
      "",
      url,
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Vos accès TIM sont prêts",
      preheader: "À imprimer et à distribuer à vos équipes.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `Les comptes de <strong>${company(ctx)}</strong> sont créés${count ? ` : <strong>${count} accès</strong>` : ""}. Votre phase de test commence aujourd'hui.`,
        ) +
        paragraph(
          "C'est vous qui les distribuez — vous savez mieux que nous qui doit commencer par quoi.",
        ) +
        callout(
          "Dans votre espace client, chaque personne a sa fiche : identifiant et code. Imprimez la page, découpez, remettez en réunion de chantier.",
        ) +
        button("Voir et imprimer mes accès", url) +
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Les identifiants ne figurent pas dans cet e-mail : ils ne s'affichent qu'une fois connecté.</span>`,
        ) +
        signature(),
    }),
  };
};

const suiviChantier = (ctx: JourneyEmailContext): BuiltEmail => ({
  subject: "Le suivi de chantier, en 3 clics",
  text: [
    hello(ctx),
    "",
    "Aujourd'hui, une seule chose : créer un chantier et y affecter une équipe.",
    "",
    "C'est la brique sur laquelle tout le reste s'appuie — sans chantier, pas de pointage.",
    "",
    "  1. Créez votre chantier (nom, adresse, dates)",
    "  2. Affectez-y vos équipes",
    "  3. Vos compagnons pointent dessus depuis leur téléphone",
    "",
    `${SITE_URL}/features`,
    textSignature(),
  ].join("\n"),
  html: shell({
    heading: "Le suivi de chantier, en 3 clics",
    preheader: "La première chose à faire dans TIM.",
    bodyHtml:
      paragraph(hello(ctx)) +
      paragraph(
        "Aujourd'hui, une seule chose : <strong>créer un chantier et y affecter une équipe</strong>. C'est la brique sur laquelle tout le reste s'appuie — sans chantier, pas de pointage.",
      ) +
      bullets([
        "Créez votre chantier : nom, adresse, dates",
        "Affectez-y vos équipes",
        "Vos compagnons pointent dessus depuis leur téléphone",
      ]) +
      button("Voir comment faire", `${SITE_URL}/features`) +
      signature(),
  }),
});

const checkIn = (ctx: JourneyEmailContext): BuiltEmail => ({
  subject: "Comment ça se passe sur le chantier ?",
  text: [
    hello(ctx),
    "",
    "Une semaine que votre test a démarré. On voulait savoir comment ça se passe de votre côté.",
    "",
    "Et si vous avez besoin de nous — une fonctionnalité à revoir, une question de vos équipes, un point à caler ensemble —, on reste disponibles jusqu'à la fin du test.",
    "",
    "Répondez directement à cet e-mail, on lit tout.",
    textSignature(),
  ].join("\n"),
  // Volontairement dépouillé : pas de bouton, pas d'encadré. Un e-mail qui
  // ressemble à une campagne n'obtient pas de réponse ; celui-ci en attend une.
  // Et il ne présume rien : demander « qu'est-ce qui coince ? » à quelqu'un dont
  // tout va bien, c'est lui donner une question à laquelle il n'a pas de réponse.
  html: shell({
    heading: "Comment ça se passe ?",
    preheader: "On prend des nouvelles, et on reste dispo.",
    bodyHtml:
      paragraph(hello(ctx)) +
      paragraph(
        "Une semaine que votre test a démarré. On voulait savoir <strong>comment ça se passe</strong> de votre côté.",
      ) +
      paragraph(
        "Et si vous avez besoin de nous — une fonctionnalité à revoir, une question de vos équipes, un point à caler ensemble —, on reste disponibles jusqu'à la fin du test.",
      ) +
      paragraph("Répondez directement à cet e-mail, on lit tout.") +
      signature(),
  }),
});

const finProche = (ctx: JourneyEmailContext): BuiltEmail => {
  const end = frDate(ctx.endDate);
  return {
    subject: "Votre test se termine dans 5 jours",
    text: [
      hello(ctx),
      "",
      `Votre phase de test s'arrête${end ? ` le ${end}` : " dans quelques jours"}.`,
      "",
      "Avant ça, on vous propose 30 minutes pour faire le bilan : ce qui a marché, ce qui manque, et la suite si vous voulez continuer.",
      "",
      "Répondez à cet e-mail avec deux créneaux qui vous arrangent.",
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Votre test se termine bientôt",
      preheader: "Faisons le bilan avant l'échéance.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `Votre phase de test s'arrête${end ? ` le <strong>${end}</strong>` : " dans quelques jours"}.`,
        ) +
        paragraph(
          "Avant ça, on vous propose <strong>30 minutes</strong> pour faire le bilan : ce qui a marché, ce qui manque, et la suite si vous voulez continuer.",
        ) +
        paragraph(
          "Répondez à cet e-mail avec deux créneaux qui vous arrangent.",
        ) +
        signature(),
    }),
  };
};

const dernierJour = (ctx: JourneyEmailContext): BuiltEmail => {
  const end = frDate(ctx.endDate);
  return {
    subject: `${end ? `${end.charAt(0).toUpperCase()}${end.slice(1)}` : "Demain"}, vos accès s'arrêtent`,
    text: [
      hello(ctx),
      "",
      `${end ? `Le ${end}` : "Demain"}, les comptes de ${ctx.clientName ?? "votre entreprise"} passent en lecture seule.`,
      "",
      "Vos chantiers et vos pointages sont conservés 30 jours. Au-delà, ils sont supprimés.",
      textSignature(),
    ].join("\n"),
    html: shell({
      heading: "Vos accès s'arrêtent bientôt",
      preheader: "Vos données sont conservées 30 jours.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph(
          `${end ? `Le <strong>${end}</strong>` : "Demain"}, les comptes de <strong>${company(ctx)}</strong> passent en lecture seule.`,
        ) +
        callout(
          "Vos chantiers et vos pointages sont conservés <strong>30 jours</strong>. Au-delà, ils sont supprimés.",
        ) +
        signature(),
    }),
  };
};

const decision = (ctx: JourneyEmailContext): BuiltEmail => ({
  subject: "Fin de votre test — votre décision",
  text: [
    hello(ctx),
    "",
    "Votre phase de test est terminée. Trois réponses possibles, et la troisième compte autant que les deux autres :",
    "",
    "  • Je continue",
    "  • J'ai besoin de plus de temps",
    "  • Je m'arrête",
    "",
    "Si TIM n'est pas le bon outil pour vous, dites-le-nous : ça nous aide plus qu'un silence poli.",
    "",
    "Répondez simplement à cet e-mail.",
    textSignature(),
  ].join("\n"),
  html: shell({
    heading: "Votre décision",
    preheader: "Continuer, prolonger, ou s'arrêter.",
    bodyHtml:
      paragraph(hello(ctx)) +
      paragraph(
        "Votre phase de test est terminée. Trois réponses possibles :",
      ) +
      bullets([
        "<strong>Je continue</strong>",
        "J'ai besoin de <strong>plus de temps</strong>",
        "<strong>Je m'arrête</strong>",
      ]) +
      callout(
        "La troisième compte autant que les deux autres. Si TIM n'est pas le bon outil pour vous, dites-le-nous : ça nous aide plus qu'un silence poli.",
      ) +
      paragraph("Répondez simplement à cet e-mail.") +
      signature(),
  }),
});

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
  return {
    subject: "Votre session de prise en main est réservée",
    text: [
      hello(ctx),
      "",
      "Votre session de prise en main est confirmée.",
      "",
      when ? `Quand : ${when}` : "",
      `Durée : 45 minutes`,
      ctx.sessionModality ? `Où    : ${ctx.sessionModality}` : "",
      link ? `Lien  : ${link}` : "",
      "",
      ...(attendeeLines(ctx).length
        ? ["Invités à cette session :", ...attendeeLines(ctx).map((l) => `  • ${l}`), ""]
        : []),
      "Besoin de déplacer ce rendez-vous ? Répondez simplement à cet e-mail.",
      textSignature(),
    ]
      .filter((l) => l !== "")
      .join("\n"),
    html: shell({
      heading: "Votre session de prise en main est réservée",
      preheader: when ? `C'est calé : ${when}.` : "C'est calé.",
      bodyHtml:
        paragraph(hello(ctx)) +
        paragraph("Votre session de prise en main est confirmée.") +
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
        paragraph(
          `<span style="color:${MUTED};font-size:14px;">Besoin de déplacer ce rendez-vous&nbsp;? Répondez simplement à cet e-mail.</span>`,
        ) +
        signature(),
    }),
  };
};

// ─── Messages au PARTENAIRE ──────────────────────────────────────────────────

const creneauReserve = (ctx: JourneyEmailContext): BuiltEmail => {
  const when = frDateTime(ctx.sessionAt);
  return {
    subject: `Créneau réservé — ${ctx.clientName ?? "votre client"}`,
    text: [
      `${ctx.clientName ?? "Votre client"} a réservé sa session de prise en main.`,
      "",
      when ? `Quand : ${when}` : "",
      ctx.sessionModality ? `Où   : ${ctx.sessionModality}` : "",
      "",
      ...(attendeeLines(ctx).length
        ? ["Seront présents :", ...attendeeLines(ctx).map((l) => `  • ${l}`), ""]
        : []),
      "Le rendez-vous est dans votre agenda. Assurez-vous que l'administrateur du compte sera bien là : c'est lui qu'on forme, et lui qui fera tourner l'outil ensuite.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: shell({
      heading: "Créneau réservé",
      preheader: `${ctx.clientName ?? "Votre client"} a choisi son horaire.`,
      bodyHtml:
        paragraph(
          `<strong>${company(ctx)}</strong> a réservé sa session de prise en main.`,
        ) +
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
        paragraph(
          "Le rendez-vous est dans votre agenda. Assurez-vous que <strong>l'administrateur du compte</strong> sera bien là : c'est lui qu'on forme, et lui qui fera tourner l'outil ensuite.",
        ),
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
  "creneau-reserve": creneauReserve,
  "recap-partenaire": recapPartenaire,
};

export const hasTemplate = (key: string): boolean => key in JOURNEY_EMAILS;
