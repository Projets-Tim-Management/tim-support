import { BORDER, BRAND, escape, FONT, internalNotice, MUTED, OUTER, paragraph, shell, SITE_URL } from "@/core/lib/email-template";
import { LOCATION_KINDS, managePath } from "@/modules/booking/lib/constants";

/**
 * LES E-MAILS D'UN RENDEZ-VOUS : au prospect (confirmation, rappel, déplacement, annulation), avec « Ajouter à mon
 * agenda » (Google, Outlook, fichier .ics) et le lien pour déplacer ou annuler — au nom de TIM Management, sans le
 * nom ni la photo du membre qui reçoit (16/11/2026 : l'équipe commerciale va s'élargir) ; au membre de l'équipe qui reçoit
 * (nouveau, déplacé, annulé), avec les problèmes en tête — le prospect est à appeler s'il en reste un.
 *
 * Purs : ils rendent sujet, HTML et texte ; l'envoi est fait par l'appelant (testés).
 */

export type MailView = {
  typeName: string;
  durationMin: number;
  start: string;
  end: string;
  locationKind: string;
  locationDetail: string | null;
  meetingUrl: string | null;
  hostName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string;
  answers: { label: string; value: string }[];
  manageToken: string;
  allowChange: boolean;
  confirmationText?: string | null;
};

export type Mail = { subject: string; html: string; text: string };

const PARIS = { timeZone: "Europe/Paris" } as const;
export const whenFr = (iso: string) =>
  `${new Date(iso).toLocaleDateString("fr-FR", { ...PARIS, weekday: "long", day: "numeric", month: "long" })} à ${new Date(iso).toLocaleTimeString("fr-FR", { ...PARIS, hour: "2-digit", minute: "2-digit" })}`;
const abs = (path: string) => `${SITE_URL.replace(/\/$/, "")}${path}`;

/** Où se passe le rendez-vous, en clair. */
export function whereFr(v: Pick<MailView, "locationKind" | "locationDetail" | "meetingUrl" | "phone">): string {
  if (v.locationKind === "meet") return v.meetingUrl ? `Visio Google Meet : ${v.meetingUrl}` : "Visio : le lien vous sera envoyé";
  if (v.locationKind === "telephone") return v.phone ? `Nous vous appelons au ${v.phone}` : "Par téléphone";
  return `${LOCATION_KINDS.find((l) => l.value === v.locationKind)?.short ?? "Lieu"}${v.locationDetail ? ` : ${v.locationDetail}` : ""}`;
}

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** « Ajouter à mon agenda » : Google, Outlook. Pur. */
export function calendarLinks(v: Pick<MailView, "typeName" | "start" | "end" | "hostName">, where: string): { google: string; outlook: string } {
  const title = `${v.typeName} — TIM Management`;
  const details = where;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${stamp(v.start)}/${stamp(v.end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(where)}`;
  const outlook = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(v.start)}&enddt=${encodeURIComponent(v.end)}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(where)}`;
  return { google, outlook };
}

/** Le fichier .ics (Apple, Outlook, tout agenda). `method` : REQUEST (nouveau ou déplacé), CANCEL (annulé). Pur. */
export function icsFile(v: Pick<MailView, "typeName" | "start" | "end" | "hostName" | "manageToken">, where: string, opts: { method: "REQUEST" | "CANCEL"; sequence: number; organizerEmail: string }): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TIM Management//Rendez-vous//FR",
    `METHOD:${opts.method === "CANCEL" ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:rdv-${v.manageToken}@tim-management.co`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(v.start)}`,
    `DTEND:${stamp(v.end)}`,
    `SUMMARY:${esc(`${v.typeName} — TIM Management`)}`,
    `DESCRIPTION:${esc(`${where}\nDéplacer ou annuler : ${abs(managePath(v.manageToken))}`)}`,
    `LOCATION:${esc(where)}`,
    `ORGANIZER;CN=TIM Management:mailto:${opts.organizerEmail}`,
    opts.method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

const button = (label: string, url: string) =>
  `<p style="margin:22px 0;"><a href="${escape(url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${BRAND};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;">${escape(label)}</a></p>`;
/** Le récapitulatif : quand, où, avec qui — un encadré, une ligne chacun. */
const details = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:${OUTER};border:1px solid ${BORDER};border-radius:10px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 18px 0;font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${escape(k)}</td></tr><tr><td style="padding:2px 18px 10px;font-family:${FONT};font-size:16px;font-weight:700;color:#22242c;">${escape(v)}</td></tr>`,
    )
    .join("")}</table>`;
const small = (html: string) => `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#8a8f98;">${html}</p>`;

function inviteeBody(v: MailView, lead: string, opts: { calendar: boolean; manage: boolean }): { html: string; text: string } {
  const where = whereFr(v);
  const links = calendarLinks(v, where);
  const rows = details([
    ["Quand", `${whenFr(v.start)} (heure de Paris) · ${v.durationMin} min`],
    ["Où", where],
  ]);
  const html = [
    paragraph(`Bonjour ${escape(v.firstName)},`),
    paragraph(lead),
    rows,
    v.meetingUrl ? button("Rejoindre la visio", v.meetingUrl) : "",
    v.confirmationText ? paragraph(escape(v.confirmationText)) : "",
    opts.calendar ? small(`Ajouter à mon agenda : <a href="${escape(links.google)}">Google</a> · <a href="${escape(links.outlook)}">Outlook</a> · le fichier joint (Apple, autres)`) : "",
    opts.manage && v.allowChange ? small(`Un empêchement ? <a href="${escape(abs(managePath(v.manageToken)))}">Déplacer ou annuler le rendez-vous</a>.`) : "",
  ].join("");
  const text = [
    `Bonjour ${v.firstName},`,
    "",
    lead.replace(/<[^>]+>/g, ""),
    "",
    `Quand : ${whenFr(v.start)} (heure de Paris), ${v.durationMin} min`,
    `Où : ${where}`,
    v.confirmationText ? `\n${v.confirmationText}` : "",
    opts.calendar ? `\nAjouter à Google Agenda : ${links.google}` : "",
    opts.manage && v.allowChange ? `\nDéplacer ou annuler : ${abs(managePath(v.manageToken))}` : "",
  ].join("\n");
  return { html, text };
}

export function confirmationMail(v: MailView): Mail {
  const b = inviteeBody(v, `Votre rendez-vous « ${escape(v.typeName)} » est confirmé.`, { calendar: true, manage: true });
  return { subject: `Confirmé : ${v.typeName}, ${whenFr(v.start)}`, html: shell({ heading: "C'est confirmé !", preheader: `${whenFr(v.start)} avec TIM Management`, bodyHtml: b.html, recipientEmail: v.email }), text: b.text };
}

export function reminderMail(v: MailView, minutesBefore: number): Mail {
  const soon = minutesBefore >= 20 * 60 ? "demain" : minutesBefore >= 90 ? `dans ${Math.round(minutesBefore / 60)} heures` : "bientôt";
  const b = inviteeBody(v, `Petit rappel : votre rendez-vous « ${escape(v.typeName)} » a lieu ${soon}.`, { calendar: false, manage: true });
  return { subject: `Rappel : ${v.typeName}, ${whenFr(v.start)}`, html: shell({ heading: "À bientôt !", preheader: whenFr(v.start), bodyHtml: b.html, recipientEmail: v.email }), text: b.text };
}

export function rescheduledMail(v: MailView): Mail {
  const b = inviteeBody(v, `Votre rendez-vous « ${escape(v.typeName)} » a bien été déplacé. Voici le nouveau créneau.`, { calendar: true, manage: true });
  return { subject: `Déplacé : ${v.typeName}, ${whenFr(v.start)}`, html: shell({ heading: "Rendez-vous déplacé", preheader: whenFr(v.start), bodyHtml: b.html, recipientEmail: v.email }), text: b.text };
}

export function cancelledMail(v: MailView, rebookUrl: string): Mail {
  const html = [
    paragraph(`Bonjour ${escape(v.firstName)},`),
    paragraph(`Votre rendez-vous « ${escape(v.typeName)} » du ${escape(whenFr(v.start))} est annulé.`),
    paragraph("Vous pouvez en reprendre un quand vous voulez :"),
    button("Choisir un autre créneau", rebookUrl),
  ].join("");
  const text = `Bonjour ${v.firstName},\n\nVotre rendez-vous « ${v.typeName} » du ${whenFr(v.start)} est annulé.\nReprendre un rendez-vous : ${rebookUrl}`;
  return { subject: `Annulé : ${v.typeName}, ${whenFr(v.start)}`, html: shell({ heading: "Rendez-vous annulé", bodyHtml: html, recipientEmail: v.email }), text };
}

/** Au membre de l'équipe : nouveau, déplacé ou annulé — les problèmes en tête. */
export function hostMail(v: MailView, what: "nouveau" | "deplace" | "annule", o: { problems: string[]; clientUrl: string | null; bookingUrl: string; reason?: string | null }): Mail {
  const verb = what === "nouveau" ? "Nouveau rendez-vous" : what === "deplace" ? "Rendez-vous déplacé" : "Rendez-vous annulé";
  const alert = o.problems.length ? `⚠️ À vérifier : ${o.problems.join(" · ")}. Le rendez-vous est bien enregistré ; si besoin, appelez le prospect au ${v.phone ?? "numéro de la fiche"} pour confirmer.` : undefined;
  const rows: [string, string][] = [
    ["Quand", `${whenFr(v.start)} · ${v.durationMin} min`],
    ["Type", v.typeName],
    ["Prospect", `${v.firstName} ${v.lastName} — ${v.company}`],
    ["E-mail", v.email],
    ["Téléphone", v.phone ?? "—"],
    ["Où", whereFr(v)],
    ...v.answers.map((a) => [a.label, a.value] as [string, string]),
    ...(o.reason ? ([["Motif", o.reason]] as [string, string][]) : []),
  ];
  const html = internalNotice({
    heading: `${o.problems.length ? "⚠️ " : ""}${verb}`,
    kicker: "Rendez-vous",
    rows,
    message: alert,
    cta: { label: o.clientUrl ? "Ouvrir la fiche du prospect" : "Ouvrir le rendez-vous", url: o.clientUrl ?? o.bookingUrl },
    links: o.clientUrl ? [{ label: "Le rendez-vous", url: o.bookingUrl }] : undefined,
  });
  const text = [`${verb} — ${v.typeName}`, alert ?? "", ...rows.map(([k, x]) => `${k} : ${x}`), "", o.clientUrl ?? o.bookingUrl].filter((l) => l !== "").join("\n");
  return { subject: `${o.problems.length ? "⚠️ " : ""}${verb} : ${v.firstName} ${v.lastName} (${v.company}), ${whenFr(v.start)}`, html, text };
}
