/**
 * Les e-mails de la formation, rédigés.
 *
 * Mêmes règles que ceux de la phase de test (modules/marketing/lib/emails.ts) :
 * un objectif par message, des phrases courtes, aucune promesse que le produit
 * ne tient pas, et une valeur manquante se retire au lieu d'afficher « — ».
 * Même habillage aussi (core/lib/email-template).
 *
 * L'OBJET et le MESSAGE D'INTRODUCTION de chaque e-mail se reprennent dans
 * Système → Formation ; le reste (créneaux, lieu, liste « à prévoir ») est
 * construit depuis le plan, pour qu'aucune information pratique ne puisse être
 * retapée de travers.
 */

import { BORDER, FONT, INK, MUTED, OUTER, SITE_URL, adminUrl, escape, paragraph, shell } from "@/core/lib/email-template";
import { TIMEZONE as PARIS } from "@/modules/marketing/lib/scheduling";
import { GUIDE_URL } from "@/modules/training/lib/training";

export type BuiltEmail = { subject: string; text: string; html: string };

export type MailSlot = {
  start?: string | null;
  end?: string | null;
  /** « Admin + Conducteur de travaux ». */
  title: string;
  participants: { name: string; hasEmail: boolean }[];
  /** Qui remet les identifiants à ce créneau. */
  accessDelivery: "formateur" | "client";
};

export type TrainingMailContext = {
  clientName?: string | null;
  dayDate: string;
  mode: "sur-place" | "distance";
  location?: string | null;
  locationDetails?: string | null;
  link?: string | null;
  trainerName?: string | null;
  /** Prénom du destinataire, pour la salutation. */
  firstName?: string | null;
  /** Les créneaux qui concernent le destinataire (tous pour le référent et le formateur). */
  slots: MailSlot[];
  /** Fiche client dans le back-office (brief du formateur). */
  clientId?: number | string | null;
  /** Textes repris dans Système → Formation, par clé de message. */
  texts?: { subject?: string | null; intro?: string | null };
};

/** Les deux textes modifiables de chaque e-mail, et leur version d'origine. */
export const DEFAULT_TEXTS: Record<string, { subject: string; intro: string }> = {
  convocation: {
    subject: "Votre formation TIM le {{date}}",
    intro:
      "Votre formation au logiciel TIM est prévue le **{{date}}**. Voici votre créneau et ce qu'il faut savoir pour en profiter pleinement.",
  },
  "recap-referent": {
    subject: "Formation TIM du {{date}} : l'organisation",
    intro: "Voici l'organisation de la formation de vos équipes le **{{date}}** : qui vient à quel créneau, et ce qu'il reste à préparer.",
  },
  "brief-formateur": {
    subject: "Demain : formation chez {{entreprise}}",
    intro: "Vous formez demain les équipes de **{{entreprise}}**. Voici le déroulé de la journée.",
  },
  "rappel-veille": {
    subject: "C'est demain : votre formation TIM",
    intro: "Petit rappel : votre formation au logiciel TIM a lieu **demain**.",
  },
  "apres-formation": {
    subject: "Après votre formation TIM : pour continuer",
    intro:
      "Merci d'avoir suivi la formation au logiciel TIM. Pour continuer à votre rythme, tout reste disponible en ligne.",
  },
};

/** Variables utilisables dans les textes modifiables. */
export const TRAINING_VARIABLES = [
  { key: "prenom", label: "Prénom du destinataire" },
  { key: "entreprise", label: "Nom de l'entreprise cliente" },
  { key: "date", label: "Date de la journée (« mardi 20 octobre »)" },
  { key: "lieu", label: "Adresse, ou « en visio »" },
  { key: "formateur", label: "Nom du formateur" },
];

const frDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: PARIS, weekday: "long", day: "numeric", month: "long" });

/** « 09:00 » → « 9 h », « 10:30 » → « 10 h 30 ». */
const frHour = (hhmm: string) => {
  const [h, m] = hhmm.split(":");
  return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}`;
};
const hours = (s: MailSlot) => (s.start ? `${frHour(s.start)}${s.end ? ` – ${frHour(s.end)}` : ""}` : "Horaire à confirmer");

/**
 * Variables remplacées, puis échappé, puis mis en forme (`**gras**`, retours à
 * la ligne). Un texte saisi n'est jamais du HTML. Une variable sans valeur
 * disparaît.
 */
const fill = (source: string, ctx: TrainingMailContext): string => {
  const values: Record<string, string> = {
    prenom: ctx.firstName?.trim() ?? "",
    entreprise: ctx.clientName?.trim() ?? "",
    date: frDay(ctx.dayDate),
    lieu: ctx.mode === "distance" ? "en visio" : (ctx.location?.trim() ?? ""),
    formateur: ctx.trainerName?.trim() ?? "",
  };
  return source.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => values[k] ?? "");
};
const richHtml = (s: string) => escape(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1");

const textsOf = (key: string, ctx: TrainingMailContext) => {
  const d = DEFAULT_TEXTS[key];
  const subject = plain(fill(ctx.texts?.subject?.trim() || d.subject, ctx)).replace(/\s*\n\s*/g, " ").trim();
  const intro = fill(ctx.texts?.intro?.trim() || d.intro, ctx);
  return { subject, introHtml: richHtml(intro), introText: plain(intro) };
};

const hello = (ctx: TrainingMailContext) => (ctx.firstName?.trim() ? `Bonjour ${ctx.firstName.trim()},` : "Bonjour,");

const box = (html: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px;"><tr>
     <td style="padding:16px 20px;background:${OUTER};border:1px solid ${BORDER};border-radius:10px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${html}</td>
   </tr></table>`;

const label = (s: string) =>
  `<span style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};font-weight:700;">${s}</span>`;

const button = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 8px;"><tr><td>
     <a href="${url}" style="display:inline-block;padding:12px 24px;background:#fe5464;border-radius:9px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${text}</a>
   </td></tr></table>`;

const list = (items: string[]) =>
  `<ul style="margin:4px 0 16px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${items
    .map((i) => `<li style="margin:2px 0;">${i}</li>`)
    .join("")}</ul>`;

/** Où : adresse + complément, ou lien + consignes. Les deux versions du message. */
const place = (ctx: TrainingMailContext): { html: string; text: string[] } => {
  const details = ctx.locationDetails?.trim();
  if (ctx.mode === "distance") {
    const link = ctx.link?.trim();
    return {
      html:
        label("En visio") +
        (link ? `<a href="${escape(link)}" style="color:#fe5464;font-weight:700;">${escape(link)}</a>` : "Le lien vous sera communiqué.") +
        (details ? `<br><span style="color:${MUTED};">${richHtml(details)}</span>` : ""),
      text: ["En visio : " + (link ?? "le lien vous sera communiqué."), ...(details ? [details] : [])],
    };
  }
  const where = ctx.location?.trim();
  return {
    html:
      label("Lieu") +
      (where ? escape(where) : "Adresse à confirmer") +
      (details ? `<br><span style="color:${MUTED};">${richHtml(details)}</span>` : ""),
    text: ["Lieu : " + (where ?? "adresse à confirmer"), ...(details ? [details] : [])],
  };
};

const slotsBlock = (ctx: TrainingMailContext, withPeople: boolean) => {
  const html = ctx.slots
    .map(
      (s) =>
        `<p style="margin:0 0 10px;"><strong>${escape(hours(s))}</strong> · ${escape(s.title)}` +
        (withPeople && s.participants.length
          ? `<br><span style="color:${MUTED};">${s.participants.map((p) => escape(p.name)).join(", ")}</span>`
          : "") +
        `</p>`,
    )
    .join("");
  const text = ctx.slots.map(
    (s) => `• ${hours(s)} — ${s.title}${withPeople && s.participants.length ? ` : ${s.participants.map((p) => p.name).join(", ")}` : ""}`,
  );
  return { html, text };
};

const SIGN = "L'équipe support TIM";
const signHtml = () => `<p style="margin:18px 0 0;font-family:${FONT};font-size:15px;color:${INK};">${SIGN}</p>`;

const assemble = (heading: string, preheader: string, bodyHtml: string, textLines: string[], subject: string): BuiltEmail => ({
  subject,
  html: shell({ heading: escape(heading), preheader: escape(preheader), bodyHtml: bodyHtml + signHtml() }),
  text: [...textLines, "", SIGN].join("\n"),
});

// ─── Les messages ───────────────────────────────────────────────────────────

const convocation = (ctx: TrainingMailContext): BuiltEmail => {
  const t = textsOf("convocation", ctx);
  const p = place(ctx);
  const slots = slotsBlock(ctx, false);
  const byTrainer = ctx.slots.some((s) => s.accessDelivery === "formateur");
  const access = byTrainer
    ? "Vos identifiants TIM vous seront remis au début de la séance."
    : "Vos identifiants TIM vous seront transmis par votre entreprise avant la séance.";
  const todo = [
    "Installez l'application <strong>TIM</strong> sur votre téléphone (App Store ou Google Play).",
    ctx.mode === "distance"
      ? "Prévoyez un ordinateur avec une connexion correcte, et votre téléphone."
      : "Venez avec votre téléphone, chargé.",
  ];
  return assemble(
    "Votre formation TIM",
    `${frDay(ctx.dayDate)} — ${hours(ctx.slots[0] ?? { title: "", participants: [], accessDelivery: "formateur" })}`,
    paragraph(escape(hello(ctx))) +
      paragraph(t.introHtml) +
      box(label(frDay(ctx.dayDate)) + slots.html + `<div style="margin-top:12px;">${p.html}</div>`) +
      paragraph("<strong>À prévoir</strong>") +
      list(todo) +
      paragraph(escape(access)),
    [
      hello(ctx),
      "",
      t.introText,
      "",
      frDay(ctx.dayDate).toUpperCase(),
      ...slots.text,
      ...p.text,
      "",
      "À prévoir :",
      "• Installez l'application TIM sur votre téléphone (App Store ou Google Play).",
      ctx.mode === "distance" ? "• Prévoyez un ordinateur et votre téléphone." : "• Venez avec votre téléphone, chargé.",
      "",
      access,
    ],
    t.subject,
  );
};

const recapReferent = (ctx: TrainingMailContext): BuiltEmail => {
  const t = textsOf("recap-referent", ctx);
  const p = place(ctx);
  const slots = slotsBlock(ctx, true);
  const prepare =
    ctx.mode === "distance"
      ? ["Chaque participant reçoit le lien dans sa convocation.", "Un ordinateur par participant, ou un écran partagé en salle."]
      : ["Une salle avec un écran ou un vidéoprojecteur.", "Une connexion internet (wifi) pour les téléphones."];
  const clientHands = ctx.slots.some((s) => s.accessDelivery === "client");
  const noEmail = ctx.slots.flatMap((s) => s.participants.filter((x) => !x.hasEmail).map((x) => x.name));
  const portal = `${SITE_URL.replace(/\/$/, "")}/espace-client/acces`;
  return assemble(
    "La formation de vos équipes",
    `${frDay(ctx.dayDate)} — l'organisation`,
    paragraph(escape(hello(ctx))) +
      paragraph(t.introHtml) +
      box(label(frDay(ctx.dayDate)) + slots.html + `<div style="margin-top:12px;">${p.html}</div>`) +
      paragraph("<strong>À préparer de votre côté</strong>") +
      list(prepare.map(escape)) +
      (noEmail.length
        ? paragraph(
            `Sans adresse e-mail, nous n'avons pas pu convoquer : <strong>${noEmail.map(escape).join(", ")}</strong>. Merci de les prévenir.`,
          )
        : "") +
      (clientHands
        ? paragraph("Pour certains créneaux, c'est vous qui distribuez les identifiants avant la séance. Ils sont dans votre espace client.") +
          button("Voir les identifiants", portal)
        : paragraph("Le formateur remettra leurs identifiants aux participants au début de la séance.")),
    [
      hello(ctx),
      "",
      t.introText,
      "",
      frDay(ctx.dayDate).toUpperCase(),
      ...slots.text,
      ...p.text,
      "",
      "À préparer de votre côté :",
      ...prepare.map((x) => `• ${x}`),
      ...(noEmail.length ? ["", `Sans adresse e-mail, non convoqués : ${noEmail.join(", ")}. Merci de les prévenir.`] : []),
      "",
      clientHands ? `Identifiants à distribuer avant la séance : ${portal}` : "Le formateur remettra les identifiants au début de la séance.",
    ],
    t.subject,
  );
};

const briefFormateur = (ctx: TrainingMailContext): BuiltEmail => {
  const t = textsOf("brief-formateur", ctx);
  const p = place(ctx);
  const rows = ctx.slots
    .map(
      (s) =>
        `<p style="margin:0 0 12px;"><strong>${escape(hours(s))}</strong> · ${escape(s.title)}<br>` +
        `<span style="color:${MUTED};">${s.participants.map((x) => escape(x.name) + (x.hasEmail ? "" : " (sans e-mail)")).join(", ") || "Aucun participant"}</span><br>` +
        `<span style="font-size:13px;">Accès : ${s.accessDelivery === "formateur" ? "<strong>à remettre par vous</strong> (fiches à imprimer)" : "distribués par le client"}</span></p>`,
    )
    .join("");
  const fiche = ctx.clientId != null ? adminUrl(`/collections/partner-clients/${ctx.clientId}`) : null;
  return assemble(
    "Votre journée de formation",
    `${ctx.clientName ?? ""} — ${frDay(ctx.dayDate)}`,
    paragraph(escape(hello(ctx))) +
      paragraph(t.introHtml) +
      box(label(frDay(ctx.dayDate)) + rows + `<div style="margin-top:4px;">${p.html}</div>`) +
      (fiche ? button("Ouvrir la fiche du client", fiche) : ""),
    [
      hello(ctx),
      "",
      t.introText,
      "",
      frDay(ctx.dayDate).toUpperCase(),
      ...ctx.slots.map(
        (s) =>
          `• ${hours(s)} — ${s.title} : ${s.participants.map((x) => x.name).join(", ") || "aucun participant"} (accès ${s.accessDelivery === "formateur" ? "à remettre par vous" : "distribués par le client"})`,
      ),
      ...p.text,
      ...(fiche ? ["", fiche] : []),
    ],
    t.subject,
  );
};

const rappelVeille = (ctx: TrainingMailContext): BuiltEmail => {
  const t = textsOf("rappel-veille", ctx);
  const p = place(ctx);
  const slots = slotsBlock(ctx, false);
  return assemble(
    "C'est demain",
    `${hours(ctx.slots[0] ?? { title: "", participants: [], accessDelivery: "formateur" })} — votre formation TIM`,
    paragraph(escape(hello(ctx))) +
      paragraph(t.introHtml) +
      box(label(frDay(ctx.dayDate)) + slots.html + `<div style="margin-top:12px;">${p.html}</div>`) +
      paragraph("Pensez à installer l'application <strong>TIM</strong> sur votre téléphone si ce n'est pas déjà fait."),
    [hello(ctx), "", t.introText, "", frDay(ctx.dayDate).toUpperCase(), ...slots.text, ...p.text, "", "Pensez à installer l'application TIM sur votre téléphone."],
    t.subject,
  );
};

const apresFormation = (ctx: TrainingMailContext): BuiltEmail => {
  const t = textsOf("apres-formation", ctx);
  // L'accueil du guide (et non la seule page des parcours) : on y cherche une
  // fonctionnalité, on y trouve les parcours et les nouveautés.
  const guides = `${GUIDE_URL}/`;
  return assemble(
    "Et maintenant ?",
    "Les guides pas à pas, et comment poser une question",
    paragraph(escape(hello(ctx))) +
      paragraph(t.introHtml) +
      list([
        "Le <strong>guide TIM</strong> : chaque fonctionnalité expliquée pas à pas, les parcours par profil et les nouveautés.",
        "Mot de passe oublié ? Utilisez le lien <strong>« Mot de passe oublié »</strong> de l'écran de connexion de TIM.",
        "Une question : répondez simplement à cet e-mail.",
      ]) +
      button("Ouvrir le guide", guides),
    [
      hello(ctx),
      "",
      t.introText,
      "",
      `• Le guide TIM, chaque fonctionnalité expliquée pas à pas : ${guides}`,
      "• Mot de passe oublié ? Lien « Mot de passe oublié » de l'écran de connexion de TIM.",
      "• Une question : répondez simplement à cet e-mail.",
    ],
    t.subject,
  );
};

export const TRAINING_EMAIL_BUILDERS: Record<string, (ctx: TrainingMailContext) => BuiltEmail> = {
  convocation,
  "recap-referent": recapReferent,
  "brief-formateur": briefFormateur,
  "rappel-veille": rappelVeille,
  "apres-formation": apresFormation,
};
