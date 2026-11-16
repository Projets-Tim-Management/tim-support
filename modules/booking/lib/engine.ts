import { randomBytes } from "node:crypto";

import type { Payload } from "payload";

import { adminUrl } from "@/core/lib/email-template";
import { validatePhone } from "@/core/lib/validators";
import { bookingPath, EARLY_PIPELINE, locationMeta, type Distribution, type ProblemKind } from "@/modules/booking/lib/constants";
import { cancelledMail, confirmationMail, hostMail, icsFile, rescheduledMail, whereFr, whenFr, type Mail, type MailView } from "@/modules/booking/lib/emails";
import { computeSlots, pickHost, type HostLoad, type Slot } from "@/modules/booking/lib/slots";
import { toPublicForm } from "@/modules/forms/lib/public-schema";
import { normalizePhone } from "@/modules/forms/lib/to-opportunity";
import { accessTokenFor, busyForPartner, getProvider, targetConnection, type Connection } from "@/modules/marketing/lib/calendar";
import { vitrinePartnerId } from "@/modules/partner/lib/vitrine-partner";

/**
 * LE MOTEUR DES RENDEZ-VOUS : les créneaux d'un type, la réservation, le déplacement, l'annulation.
 *
 * LA RÈGLE (16/11/2026, point 13) : une réservation n'est JAMAIS perdue. Agenda illisible, événement non créé, e-mail
 * qui ne part pas, fiche qui ne se crée pas : le rendez-vous est enregistré quand même, le problème est noté dessus
 * (« ⚠️ » dans la liste), dans la tâche du CRM et dans l'e-mail à l'équipe — pour qu'on appelle le prospect. Seul un
 * créneau qui n'est plus libre est refusé (le prospect en choisit un autre).
 */

type Raw = Record<string, unknown>;
type Id = number | string;
const idOf = (v: unknown): string | null => (v == null ? null : typeof v === "object" ? (((v as Raw).id as Id | undefined) != null ? String((v as Raw).id) : null) : String(v));
const MIN = 60_000;
/**
 * Un identifiant de relation tel que la base l'attend : un NOMBRE (Postgres). Passé en texte (« 242 »), Payload
 * refuse la relation — c'est ce qui avait empêché la tâche « Démo en visio » du premier test de bout en bout
 * (16/11/2026 : « Le champ suivant n'est pas valide : Opportunité »).
 */
const relId = (id: string | number) => (typeof id === "number" ? id : /^\d+$/.test(id) ? Number(id) : id);

/** Une question de la page : `type` texte, paragraphe, choix ou choix multiple (« multi », réponses séparées par des virgules). */
export type Question = { key: string; label: string; type: string; options: { value: string; label: string }[]; required: boolean; crmField: string };

/** Les champs du formulaire qui sont l'identité du prospect (demandée à part), pas une question. */
const IDENTITY_FIELDS = new Set(["company_name", "societe", "email", "telephone", "nom", "prenom"]);

/** Les questions d'un formulaire de contact, telles que la page de réservation les pose. Pur (testé). */
export function formQuestions(form: { fields?: { name: string; type: string; label: string; required: boolean; options?: { value: string; label: string }[] }[] } | null): Question[] {
  return (form?.fields ?? [])
    .filter((f) => !IDENTITY_FIELDS.has(f.name) && f.type !== "hidden" && f.type !== "consent")
    .map((f) => ({
      key: f.name,
      label: f.label,
      type: f.type === "multiselect" || f.type === "checkboxes" ? "multi" : f.options?.length ? "choix" : f.type === "textarea" ? "paragraphe" : "texte",
      options: (f.options ?? []).map((o) => ({ value: String(o.value), label: String(o.label) })),
      required: f.required,
      crmField: f.name === "collaborateurs" ? "collaborateurs" : "aucun",
    }));
}
export type BookingType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMin: number;
  /** Les lieux proposés ; le prospect choisit s'il y en a plusieurs (comme Calendly). */
  locations: string[];
  locationDetail: string | null;
  hosts: { id: string; name: string; email: string | null; partner: string | null }[];
  distribution: Distribution;
  rules: { hours: unknown; dateOverrides: unknown; incrementMin: number; bufferBeforeMin: number; bufferAfterMin: number; minNoticeHours: number; horizonDays: number; maxPerDay: number | null; noSameDay: boolean; limitedSlots: boolean };
  phoneRequired: boolean;
  /** Les questions sont celles d'un formulaire de contact : en visio, toutes obligatoires. */
  fromForm: boolean;
  /** Formulaire simplifié (le bouton de la vitrine) : un nom, un e-mail, le téléphone pour un appel, un message. */
  simpleForm: boolean;
  questions: Question[];
  confirmationEmail: boolean;
  confirmationText: string | null;
  reminders: number[];
  notifyHost: boolean;
  allowReschedule: boolean;
  allowCancel: boolean;
  changeUntilHours: number;
  crmStage: string | null;
  confirmationMessage: string | null;
  redirectUrl: string | null;
};

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Un type de rendez-vous tel que le moteur le lit (membres de l'équipe compris). Pur (testé). */
export function toBookingType(d: Raw): BookingType {
  const s = (d.scheduling ?? {}) as Raw;
  return {
    id: String(d.id),
    slug: String(d.slug),
    name: String(d.name ?? "Rendez-vous"),
    description: str(d.description),
    durationMin: num(d.durationMin, 30),
    locations: ((Array.isArray(d.locations) && d.locations.length ? d.locations : [d.locationKind ?? "meet"]) as unknown[]).map(String),
    locationDetail: str(d.locationDetail),
    hosts: (Array.isArray(d.hosts) ? (d.hosts as unknown[]) : []).flatMap((h) =>
      h && typeof h === "object" ? [{ id: String((h as Raw).id), name: String((h as Raw).name ?? [(h as Raw).firstName, (h as Raw).lastName].filter(Boolean).join(" ") ?? "TIM Management") || "TIM Management", email: str((h as Raw).email), partner: idOf((h as Raw).partner) }] : [],
    ),
    distribution: d.distribution === "equilibre" ? "equilibre" : "disponibilite",
    rules: {
      hours: s.hours ?? null,
      dateOverrides: s.dateOverrides ?? null,
      incrementMin: num(d.incrementMin, 30),
      bufferBeforeMin: num(d.bufferBeforeMin, 0),
      bufferAfterMin: num(d.bufferAfterMin, 0),
      minNoticeHours: num(d.minNoticeHours, 4),
      horizonDays: num(d.horizonDays, 30),
      maxPerDay: d.maxPerDay == null || d.maxPerDay === "" ? null : num(d.maxPerDay, 0) || null,
      noSameDay: d.noSameDay !== false,
      limitedSlots: d.limitedSlots !== false,
    },
    phoneRequired: d.phoneRequired !== false,
    fromForm: Boolean(d.sourceForm && typeof d.sourceForm === "object"),
    simpleForm: d.simpleForm === true,
    questions:
      d.sourceForm && typeof d.sourceForm === "object"
        ? formQuestions(toPublicForm(d.sourceForm as never))
        : (Array.isArray(d.questions) ? (d.questions as Raw[]) : []).flatMap((q) =>
            q.key && q.label ? [{ key: String(q.key), label: String(q.label), type: String(q.type ?? "texte"), options: String(q.options ?? "").split("\n").map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o, label: o })), required: Boolean(q.required), crmField: String(q.crmField ?? "aucun") }] : [],
          ),
    confirmationEmail: d.confirmationEmail !== false,
    confirmationText: str(d.confirmationText),
    reminders: (Array.isArray(d.reminders) ? (d.reminders as Raw[]) : []).map((r) => num(r.minutesBefore, 0)).filter((m) => m >= 10),
    notifyHost: d.notifyHost !== false,
    allowReschedule: d.allowReschedule !== false,
    allowCancel: d.allowCancel !== false,
    changeUntilHours: num(d.changeUntilHours, 2),
    crmStage: str(d.crmStage),
    confirmationMessage: str(d.confirmationMessage),
    redirectUrl: str(d.redirectUrl) && /^https:\/\//.test(String(d.redirectUrl)) ? String(d.redirectUrl) : null,
  };
}

export async function loadType(payload: Payload, slug: string): Promise<BookingType | null> {
  const r = await payload.find({ collection: "booking-types" as never, where: { and: [{ slug: { equals: slug } }, { active: { equals: true } }] }, limit: 1, depth: 1, overrideAccess: true }).catch(() => null);
  const d = r?.docs[0] as Raw | undefined;
  const t = d ? toBookingType(d) : null;
  return t && t.hosts.length ? t : null;
}

/* ─── Les créneaux ─────────────────────────────────────────────────────── */

/** Les sessions de prise en main d'un partenaire (parcours clients) : elles occupent aussi son agenda. */
async function sessionsOf(payload: Payload, partner: string): Promise<string[]> {
  const r = await payload.find({ collection: "journey-runs", where: { partner: { equals: partner } }, limit: 500, depth: 0, overrideAccess: true, select: { sessionAt: true, reviewAt: true } as never }).catch(() => null);
  return ((r?.docs ?? []) as unknown as Raw[]).flatMap((d) => [d.sessionAt, d.reviewAt]).filter((v): v is string => typeof v === "string" && Date.parse(v) > Date.now() - 24 * 60 * MIN);
}

export type Availability = { slots: Slot[]; loads: HostLoad[]; unverified: string[] };

/**
 * Les créneaux libres d'un type : pour chaque membre, son agenda connecté (lu sur la fenêtre de réservation), ses
 * rendez-vous déjà pris (tous types) et ses sessions de prise en main. Un agenda illisible ou absent ne bloque pas :
 * ses horaires font foi, et le membre est noté « non vérifié » (la réservation portera le problème).
 * `except` : le rendez-vous qu'on déplace, qui ne s'occupe pas lui-même.
 */
export async function availability(payload: Payload, t: BookingType, now = new Date(), except?: string): Promise<Availability> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + (t.rules.horizonDays + 1) * 24 * 60 * MIN).toISOString();
  const booked = (await payload
    .find({ collection: "bookings" as never, where: { and: [{ status: { equals: "confirme" } }, { host: { in: t.hosts.map((h) => h.id) } }, { end: { greater_than: new Date(now.getTime() - 31 * 24 * 60 * MIN).toISOString() } }] }, pagination: false, depth: 0, overrideAccess: true, select: { host: true, start: true, end: true, type: true } as never })
    .then((r) => r.docs as unknown as Raw[])
    .catch(() => [] as Raw[])).filter((b) => String(b.id) !== except);
  const unverified: string[] = [];
  const loads = await Promise.all(
    t.hosts.map(async (h): Promise<HostLoad> => {
      const mine = booked.filter((b) => idOf(b.host) === h.id);
      let calendar: { start: string; end: string }[] = [];
      let sessions: { start: string; end: string }[] = [];
      if (h.partner) {
        const [reading, taken] = await Promise.all([busyForPartner(payload, h.partner, from, to).catch(() => ({ reliable: false, periods: [] })), sessionsOf(payload, h.partner)]);
        if (!reading.reliable) unverified.push(h.id);
        calendar = reading.periods;
        sessions = taken.map((s) => ({ start: s, end: new Date(Date.parse(s) + 60 * MIN).toISOString() }));
      } else unverified.push(h.id);
      return {
        id: h.id,
        busy: [...calendar, ...sessions, ...mine.map((b) => ({ start: String(b.start), end: String(b.end) }))],
        sameType: mine.filter((b) => idOf(b.type) === t.id).map((b) => ({ start: String(b.start) })),
      };
    }),
  );
  const slots = computeSlots({ ...t.rules, hours: t.rules.hours as never, dateOverrides: t.rules.dateOverrides as never, durationMin: t.durationMin, seed: t.slug }, loads, now.getTime());
  return { slots, loads, unverified };
}

/* ─── La réservation ───────────────────────────────────────────────────── */

export type Person = { firstName: string; lastName: string; email: string; phone: string | null; company: string };
export type BookingInput = { at: string; person: Person; answers: Record<string, string>; location: string; tracking: Record<string, string>; submission: string | null };
export type Problem = { kind: ProblemKind; message: string; at: string };

/**
 * Vérifie ce que le prospect a saisi : les champs de base, le lieu choisi, les questions obligatoires. `known` : ce que
 * sa demande d'origine (formulaire de contact) dit déjà — repris pour ce qu'il n'a pas eu à ressaisir, et une réponse
 * reprise telle quelle n'a pas à figurer dans la liste des choix (le formulaire a ses propres libellés). Pur (testé).
 */
export function checkInput(
  t: BookingType,
  raw: Raw,
  known: { person?: Partial<Record<keyof Person, string | undefined>>; answers?: Record<string, string> } = {},
): { ok: true; person: Person; answers: Record<string, string>; location: string } | { ok: false; field: string; message: string } {
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const k = known.person ?? {};
  const person = {
    firstName: clean(raw.firstName, 60) || clean(k.firstName, 60),
    lastName: clean(raw.lastName, 60) || clean(k.lastName, 60),
    email: (clean(raw.email, 160) || clean(k.email, 160)).toLowerCase(),
    phone: clean(raw.phone, 30) || clean(k.phone, 30) || null,
    company: clean(raw.company, 120) || clean(k.company, 120),
  };
  // Formulaire simplifié : un seul champ « nom » (prénom et nom), pas de société — la fiche prend le nom de la personne.
  if (t.simpleForm) {
    const full = clean(raw.name, 120);
    if (full && !person.firstName) {
      const parts = full.split(/\s+/);
      person.firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
      person.lastName = parts.length > 1 ? parts[parts.length - 1] : "—";
    }
    if (!person.company) person.company = [person.firstName, person.lastName === "—" ? "" : person.lastName].filter(Boolean).join(" ");
  }
  const location = t.locations.length === 1 ? t.locations[0] : clean(raw.location, 20);
  if (!t.locations.includes(location)) return { ok: false, field: "location", message: "Choisissez comment se passe le rendez-vous." };
  if (!person.firstName) return t.simpleForm ? { ok: false, field: "name", message: "Indiquez votre nom." } : { ok: false, field: "firstName", message: "Indiquez votre prénom." };
  // Le formulaire ne demande qu'un « nom » : un seul mot, et le nom de famille manque — on ne le redemande pas.
  if (!person.lastName && known.person) person.lastName = "—";
  if (!person.lastName) return { ok: false, field: "lastName", message: "Indiquez votre nom." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(person.email)) return { ok: false, field: "email", message: "Indiquez une adresse e-mail valide." };
  if (!person.company) return { ok: false, field: "company", message: "Indiquez votre société." };
  // Visio = démo : tout est obligatoire quand les questions viennent du formulaire (16/11/2026) — sauf si le
  // prospect vient de l'envoyer : sa demande fait foi, on ne lui redemande rien.
  const all = t.fromForm && location === "meet" && !known.answers;
  if ((t.phoneRequired || all || location === "telephone") && !person.phone) return { ok: false, field: "phone", message: location === "telephone" ? "Indiquez le numéro où nous vous appelons." : "Indiquez votre téléphone." };
  if (person.phone) {
    const n = normalizePhone(person.phone);
    if (!n || validatePhone(n) !== true) return { ok: false, field: "phone", message: "Ce numéro de téléphone ne semble pas valide." };
    person.phone = n;
  }
  const given = (raw.answers && typeof raw.answers === "object" ? raw.answers : {}) as Raw;
  const answers: Record<string, string> = {};
  for (const q of t.questions) {
    const typed = clean(given[q.key], q.type === "paragraphe" ? 2000 : 300);
    const fromDemande = clean(known.answers?.[q.key], 300);
    const v = typed || fromDemande;
    if ((q.required || all) && !v) return { ok: false, field: `q-${q.key}`, message: `Répondez à « ${q.label} ».` };
    const values = q.type === "multi" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [v];
    if (v && v !== fromDemande && (q.type === "choix" || q.type === "multi") && q.options.length && !values.every((x) => q.options.some((o) => o.value === x))) return { ok: false, field: `q-${q.key}`, message: `Choisissez une réponse à « ${q.label} ».` };
    if (v) answers[q.key] = values.join(",");
  }
  return { ok: true, person, answers, location };
}

/** Le lieu d'un rendez-vous : celui que le prospect a choisi, sinon le premier du type. */
export const locationOf = (t: BookingType, b: Raw) => (typeof b.locationKind === "string" && b.locationKind ? b.locationKind : t.locations[0]);

/** Une réponse en clair : le libellé de chaque choix (« 11 - 25 », « Planning, Pointage »). */
const answerLabel = (q: Question, v: string) => (q.options.length ? v.split(",").map((x) => q.options.find((o) => o.value === x.trim())?.label ?? x.trim()).join(", ") : v);
const answersFor = (t: BookingType, answers: Record<string, string>) => t.questions.filter((q) => answers[q.key]).map((q) => ({ label: q.label, value: answerLabel(q, answers[q.key]) }));

/** Ce que les e-mails d'un rendez-vous affichent (confirmation, rappel, déplacement, annulation, avis à l'équipe). */
export function mailView(t: BookingType, b: Raw, hostName: string): MailView {
  const answers = (b.answers ?? {}) as Record<string, string>;
  return {
    typeName: t.name,
    durationMin: t.durationMin,
    start: String(b.start),
    end: String(b.end),
    locationKind: locationOf(t, b),
    locationDetail: t.locationDetail,
    meetingUrl: str(b.meetingUrl),
    hostName,
    firstName: String(b.firstName),
    lastName: String(b.lastName),
    email: String(b.email),
    phone: str(b.phone),
    company: String(b.company),
    answers: answersFor(t, answers),
    manageToken: String(b.manageToken),
    allowChange: t.allowReschedule || t.allowCancel,
    confirmationText: t.confirmationText,
  };
}

const PROBLEM_TEXT: Record<ProblemKind, string> = {
  "agenda-lecture": "agenda non vérifié",
  "agenda-evenement": "pas d'événement d'agenda (ni invitation ni lien de visio)",
  "email-prospect": "le prospect n'a pas reçu la confirmation",
  "email-equipe": "l'équipe n'a pas été prévenue par e-mail",
  crm: "fiche du prospect non créée",
};
/**
 * Le problème en clair. Côté CRM, la fiche peut exister et la tâche seule manquer : on dit lequel (16/11/2026 : « fiche
 * non créée » s'affichait alors que seule la tâche avait été refusée).
 */
export const problemText = (p: Pick<Problem, "kind"> & { message?: string }) =>
  p.kind === "crm" && /^Tâche/.test(p.message ?? "") ? "tâche « Réunion » non créée sur la fiche (à poser à la main)" : PROBLEM_TEXT[p.kind];

async function send(payload: Payload, to: string, mail: Mail, ics?: string): Promise<boolean> {
  return payload
    .sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, ...(ics ? { attachments: [{ filename: "rendez-vous.ics", content: ics, contentType: "text/calendar; charset=utf-8" }] } : {}) })
    .then(() => true)
    .catch((e) => {
      payload.logger.error(`[rendez-vous] e-mail à ${to} non envoyé : ${e instanceof Error ? e.message : String(e)}`);
      return false;
    });
}

/** Le prospect dans le CRM : la fiche de sa demande, sinon celle qui porte son e-mail, sinon une nouvelle. */
async function attachClient(payload: Payload, t: BookingType, b: { person: Person; answers: Record<string, string>; submissionClient: string | null; hostPartner: string | null; start: string; stage: string | null }): Promise<string> {
  const { person: p } = b;
  const effectif = t.questions.find((q) => q.crmField === "collaborateurs" && b.answers[q.key]);
  let clientId = b.submissionClient ?? (await knownClient(payload, p.email));
  if (clientId) {
    const c = (await payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null;
    const data: Raw = {};
    if (c && b.stage && EARLY_PIPELINE.includes(String(c.clientStatus)) && c.clientStatus !== b.stage) data.clientStatus = b.stage;
    if (c && effectif && !c.collaborateurs) data.collaborateurs = answerLabel(effectif, b.answers[effectif.key]);
    if (Object.keys(data).length) await payload.update({ collection: "partner-clients", id: clientId, data: data as never, overrideAccess: true }).catch((e) => payload.logger.warn(`[rendez-vous] fiche ${clientId} non avancée : ${e}`));
    return clientId;
  }
  const partner = b.hostPartner ?? (await vitrinePartnerId(payload));
  const doc = await payload.create({
    collection: "partner-clients",
    data: {
      companyName: p.company,
      email: p.email,
      phone: p.phone ?? undefined,
      partner: (partner == null ? partner : relId(partner)) as never,
      clientStatus: (b.stage ?? "nouvelle") as never,
      ...(effectif ? { collaborateurs: answerLabel(effectif, b.answers[effectif.key]) } : {}),
      leadNotes: [`Rendez-vous « ${t.name} » réservé en ligne pour le ${whenFr(b.start)}.`, `Contact : ${p.firstName} ${p.lastName} — ${p.email}${p.phone ? ` — ${p.phone}` : ""}`, ...answersFor(t, b.answers).map((a) => `${a.label} : ${a.value}`)].join("\n"),
      _status: "published",
    } as never,
    overrideAccess: true,
  });
  clientId = String(doc.id);
  await payload
    .create({ collection: "client-contacts", data: { client: relId(clientId) as never, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone ?? undefined, role: `Rendez-vous : ${t.name}` } as never, overrideAccess: true })
    .catch((e) => payload.logger.error(`[rendez-vous] contact de ${clientId} non créé : ${e}`));
  return clientId;
}

/** Fiche déjà connue pour cette adresse : la fiche, ses contacts, son espace client. */
async function knownClient(payload: Payload, email: string): Promise<string | null> {
  const direct = await payload.find({ collection: "partner-clients", where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true }).catch(() => null);
  if (direct?.docs[0]) return String(direct.docs[0].id);
  for (const collection of ["client-contacts", "client-portal-accounts"] as const) {
    const found = await payload.find({ collection, where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true }).catch(() => null);
    const client = idOf((found?.docs[0] as Raw | undefined)?.client);
    if (client) return client;
  }
  return null;
}

/** L'événement dans l'agenda du membre : créé, déplacé (lien de visio gardé) ou supprimé. Null : pas d'agenda. */
async function calendarFor(payload: Payload, partner: string | null): Promise<{ connection: Connection; calendarId: string; token: string } | null> {
  if (!partner) return null;
  const target = await targetConnection(payload, partner).catch(() => null);
  if (!target) return null;
  const token = await accessTokenFor(payload, target.connection);
  return token ? { ...target, token } : null;
}

function eventInput(t: BookingType, b: Raw, calendarId: string) {
  const answers = answersFor(t, (b.answers ?? {}) as Record<string, string>);
  return {
    calendarId,
    summary: `${t.name} — ${String(b.company)} (${String(b.firstName)} ${String(b.lastName)})`,
    description: [`Réservé en ligne (${bookingPath(t.slug)}).`, `${String(b.firstName)} ${String(b.lastName)} — ${String(b.email)}${b.phone ? ` — ${String(b.phone)}` : ""}`, ...answers.map((a) => `${a.label} : ${a.value}`)].join("\n"),
    start: String(b.start),
    end: String(b.end),
    attendees: [String(b.email)],
    online: locationOf(t, b) === "meet",
    location: locationOf(t, b) === "meet" ? undefined : whereFr({ locationKind: locationOf(t, b), locationDetail: t.locationDetail, meetingUrl: null, phone: str(b.phone) }),
    requestId: `rdv-${String(b.manageToken)}-${Date.parse(String(b.start))}`,
    runKey: `rdv-${String(b.id)}`,
  };
}

/** La tâche « Réunion » du CRM : son titre et son contenu, problèmes en tête. Pur (testé). */
export function taskContent(t: BookingType, b: Raw, hostName: string, problems: Problem[]): { title: string; content: string; highPriority: boolean } {
  const who = `${String(b.firstName)} ${String(b.lastName)}`;
  const answers = answersFor(t, (b.answers ?? {}) as Record<string, string>);
  return {
    title: `${problems.length ? "⚠️ " : ""}${t.locations.length > 1 ? locationMeta(locationOf(t, b)).task : t.name} — ${String(b.company)} (${who})`,
    highPriority: problems.length > 0,
    content: [
      problems.length ? `⚠️ À RAPPELER pour confirmer : ${problems.map(problemText).join(" · ")}.` : "",
      `${whenFr(String(b.start))} · ${t.durationMin} min · reçu par ${hostName}`,
      whereFr({ locationKind: locationOf(t, b), locationDetail: t.locationDetail, meetingUrl: str(b.meetingUrl), phone: str(b.phone) }),
      `Contact : ${who} — ${String(b.email)}${b.phone ? ` — ${String(b.phone)}` : ""}`,
      ...answers.map((a) => `${a.label} : ${a.value}`),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export type BookResult = { ok: true; booking: { start: string; end: string; host: string; meetingUrl: string | null; manage: string; problems: number } } | { ok: false; status: number; error: string };

export async function book(payload: Payload, t: BookingType, input: BookingInput, now = new Date()): Promise<BookResult> {
  const av = await availability(payload, t, now);
  const slot = av.slots.find((s) => s.at === input.at);
  if (!slot) return { ok: false, status: 409, error: "Ce créneau vient d'être pris : choisissez-en un autre." };
  const hostId = pickHost(slot.hosts, t.hosts.map((h) => h.id), av.loads, slot.at, t.distribution)!;
  const host = t.hosts.find((h) => h.id === hostId)!;
  const start = slot.at;
  const end = new Date(Date.parse(start) + t.durationMin * MIN).toISOString();
  const problems: Problem[] = [];
  const note = (kind: ProblemKind, message: string) => problems.push({ kind, message: message.slice(0, 300), at: new Date().toISOString() });
  if (av.unverified.includes(hostId)) note("agenda-lecture", host.partner ? `L'agenda de ${host.name} n'a pas pu être lu : le créneau n'a pas été vérifié.` : `${host.name} n'a pas d'agenda connecté : le créneau suit seulement les horaires.`);

  // La source : celle de la demande d'origine si le rendez-vous la suit, sinon celle de l'adresse.
  const submission = input.submission ? ((await payload.findByID({ collection: "form-submissions", id: input.submission, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null) : null;
  const TRACK = ["channel", "sourcePagePath", "landingPath", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "gclid", "msclkid", "fbclid", "oaiclid"];
  const tracking = submission ? Object.fromEntries(TRACK.flatMap((k) => (submission[k] ? [[k, String(submission[k])]] : []))) : input.tracking;

  let booking: Raw;
  try {
    booking = (await payload.create({
      collection: "bookings" as never,
      data: { summary: `${input.person.company} — ${input.person.firstName} ${input.person.lastName}`, start, end, status: "confirme", type: Number(t.id), host: Number(hostId), slotKey: `${hostId}|${start}`, ...input.person, answers: input.answers, locationKind: input.location, tracking, submission: submission ? submission.id : null, manageToken: randomBytes(18).toString("base64url"), remindersSent: [], problems, hasProblem: problems.length > 0 } as never,
      overrideAccess: true,
    })) as unknown as Raw;
  } catch (e) {
    // Même instant, même membre, à la même seconde : l'index unique a joué.
    payload.logger.warn(`[rendez-vous] ${start} refusé pour ${host.name} : ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, status: 409, error: "Ce créneau vient d'être pris : choisissez-en un autre." };
  }
  const id = String(booking.id);

  // 1. Le prospect dans le CRM — d'abord : c'est ce qui ne doit jamais manquer.
  let clientId: string | null = null;
  try {
    clientId = await attachClient(payload, t, { person: input.person, answers: input.answers, submissionClient: submission ? idOf(submission.client) : null, hostPartner: host.partner, start, stage: locationMeta(input.location).stage ?? t.crmStage });
  } catch (e) {
    note("crm", e instanceof Error ? e.message : String(e));
  }

  // 2. L'événement dans l'agenda (invitation au prospect, lien Meet).
  let meetingUrl: string | null = null;
  let event: { eventId: string; calendarId: string; connection: string } | null = null;
  const cal = await calendarFor(payload, host.partner);
  if (!cal) note("agenda-evenement", host.partner ? `L'agenda de ${host.name} ne répond pas (à reconnecter) : envoyez l'invitation à la main.` : `${host.name} n'a pas d'agenda connecté : envoyez l'invitation à la main.`);
  else {
    try {
      const created = await getProvider(cal.connection.provider)!.createEvent(cal.token, eventInput(t, booking, cal.calendarId));
      meetingUrl = created.meetingUrl ?? null;
      event = { eventId: created.eventId, calendarId: cal.calendarId, connection: String(cal.connection.id) };
    } catch (e) {
      note("agenda-evenement", `Création de l'événement refusée : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  booking = { ...booking, meetingUrl };

  // 3. Les e-mails : la confirmation au prospect, l'avis au membre (problèmes en tête).
  const view = mailView(t, booking, host.name);
  if (t.confirmationEmail) {
    const ics = icsFile(view, whereFr(view), { method: "REQUEST", sequence: 0, organizerEmail: host.email ?? "contact@tim-management.co" });
    if (!(await send(payload, view.email, confirmationMail(view), ics))) note("email-prospect", "La confirmation n'est pas partie (messagerie indisponible).");
  }

  // 4. La tâche « Réunion » datée, dans « À faire » de la fiche.
  let taskId: string | null = null;
  if (clientId) {
    const task = taskContent(t, booking, host.name, problems);
    taskId = await payload
      .create({ collection: "client-activities", data: { client: relId(clientId), type: "tache", taskKind: "reunion", title: task.title.slice(0, 200), dueDate: start, content: task.content, highPriority: task.highPriority } as never, overrideAccess: true })
      .then((d) => String(d.id))
      .catch((e) => {
        note("crm", `Tâche non créée : ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
  }

  if (t.notifyHost || problems.length) {
    const to = host.email;
    const mail = hostMail(view, "nouveau", { problems: problems.map(problemText), clientUrl: clientId ? adminUrl(`/collections/partner-clients/${clientId}`) : null, bookingUrl: adminUrl(`/collections/bookings/${id}`) });
    if (!to || !(await send(payload, to, mail))) note("email-equipe", to ? "L'avis au membre de l'équipe n'est pas parti." : `${host.name} n'a pas d'adresse e-mail.`);
  }

  await payload
    .update({ collection: "bookings" as never, id, data: { client: clientId ? Number(clientId) : null, task: taskId ? Number(taskId) : null, meetingUrl, eventId: event?.eventId ?? null, calendarId: event?.calendarId ?? null, connection: event ? Number(event.connection) : null, problems, hasProblem: problems.length > 0 } as never, overrideAccess: true })
    .catch((e) => payload.logger.error(`[rendez-vous] ${id} non mis à jour : ${e}`));

  return { ok: true, booking: { start, end, host: host.name, meetingUrl, manage: String(booking.manageToken), problems: problems.length } };
}

/* ─── Déplacer, annuler (depuis le lien des e-mails) ───────────────────── */

export async function bookingByToken(payload: Payload, token: string): Promise<{ booking: Raw; type: BookingType } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await payload.find({ collection: "bookings" as never, where: { manageToken: { equals: token } }, limit: 1, depth: 0, overrideAccess: true }).catch(() => null);
  const booking = r?.docs[0] as Raw | undefined;
  if (!booking) return null;
  const typeDoc = (await payload.findByID({ collection: "booking-types" as never, id: String(idOf(booking.type)), depth: 1, overrideAccess: true }).catch(() => null)) as Raw | null;
  return typeDoc ? { booking, type: toBookingType(typeDoc) } : null;
}

/** Peut-on encore déplacer ou annuler ? Pur (testé). */
export function canChange(t: BookingType, b: Raw, what: "deplacer" | "annuler", now: Date): string | null {
  if (b.status !== "confirme") return "Ce rendez-vous n'est plus actif.";
  if (what === "deplacer" && !t.allowReschedule) return "Ce rendez-vous ne se déplace pas en ligne : répondez à l'e-mail de confirmation.";
  if (what === "annuler" && !t.allowCancel) return "Ce rendez-vous ne s'annule pas en ligne : répondez à l'e-mail de confirmation.";
  if (Date.parse(String(b.start)) - now.getTime() < t.changeUntilHours * 60 * MIN) return `Il est trop tard pour le ${what === "deplacer" ? "déplacer" : "annuler"} en ligne (${t.changeUntilHours} h avant au plus) : répondez à l'e-mail de confirmation.`;
  return null;
}

async function appendProblems(payload: Payload, b: Raw, problems: Problem[]) {
  if (!problems.length) return;
  await payload.update({ collection: "bookings" as never, id: String(b.id), data: { problems: [...((b.problems as Problem[] | undefined) ?? []), ...problems], hasProblem: true } as never, overrideAccess: true }).catch(() => null);
}

export async function reschedule(payload: Payload, token: string, at: string, now = new Date()): Promise<BookResult> {
  const found = await bookingByToken(payload, token);
  if (!found) return { ok: false, status: 404, error: "Rendez-vous introuvable." };
  const { booking: b, type: t } = found;
  const refused = canChange(t, b, "deplacer", now);
  if (refused) return { ok: false, status: 400, error: refused };
  const av = await availability(payload, t, now, String(b.id));
  const slot = av.slots.find((s) => s.at === at);
  if (!slot) return { ok: false, status: 409, error: "Ce créneau vient d'être pris : choisissez-en un autre." };
  const oldHost = idOf(b.host)!;
  const hostId = slot.hosts.includes(oldHost) ? oldHost : pickHost(slot.hosts, t.hosts.map((h) => h.id), av.loads, at, t.distribution)!;
  const host = t.hosts.find((h) => h.id === hostId) ?? t.hosts[0];
  const end = new Date(Date.parse(at) + t.durationMin * MIN).toISOString();
  const problems: Problem[] = [];
  const note = (kind: ProblemKind, message: string) => problems.push({ kind, message: message.slice(0, 300), at: new Date().toISOString() });
  try {
    await payload.update({ collection: "bookings" as never, id: String(b.id), data: { start: at, end, host: Number(hostId), slotKey: `${hostId}|${at}`, rescheduledCount: num(b.rescheduledCount, 0) + 1, remindersSent: [] } as never, overrideAccess: true });
  } catch {
    return { ok: false, status: 409, error: "Ce créneau vient d'être pris : choisissez-en un autre." };
  }
  let next: Raw = { ...b, start: at, end, host: hostId };
  if (av.unverified.includes(hostId)) note("agenda-lecture", `Créneau non vérifié dans l'agenda de ${host.name}.`);

  // L'agenda : déplacer l'événement chez le même membre (le lien de visio reste) ; sinon le recréer chez le nouveau.
  let meetingUrl = str(b.meetingUrl);
  let eventId = str(b.eventId);
  let calendarId = str(b.calendarId);
  const oldPartner = t.hosts.find((h) => h.id === oldHost)?.partner ?? null;
  if (hostId === oldHost && eventId && calendarId) {
    const cal = await calendarFor(payload, host.partner);
    try {
      if (!cal) throw new Error("agenda indisponible");
      const moved = await getProvider(cal.connection.provider)!.updateEvent(cal.token, eventId, eventInput(t, next, calendarId));
      meetingUrl = moved.meetingUrl ?? meetingUrl;
    } catch (e) {
      note("agenda-evenement", `L'événement n'a pas été déplacé : ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    if (eventId && calendarId) {
      const old = await calendarFor(payload, oldPartner);
      if (old) await getProvider(old.connection.provider)!.deleteEvent(old.token, calendarId, eventId).catch(() => null);
    }
    const cal = await calendarFor(payload, host.partner);
    eventId = null;
    calendarId = null;
    meetingUrl = null;
    if (!cal) note("agenda-evenement", `${host.name} n'a pas d'agenda joignable : envoyez l'invitation à la main.`);
    else {
      try {
        const created = await getProvider(cal.connection.provider)!.createEvent(cal.token, eventInput(t, next, cal.calendarId));
        eventId = created.eventId;
        calendarId = cal.calendarId;
        meetingUrl = created.meetingUrl ?? null;
      } catch (e) {
        note("agenda-evenement", `Création de l'événement refusée : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  next = { ...next, meetingUrl };
  const view = mailView(t, next, host.name);
  const ics = icsFile(view, whereFr(view), { method: "REQUEST", sequence: num(b.rescheduledCount, 0) + 1, organizerEmail: host.email ?? "contact@tim-management.co" });
  if (!(await send(payload, view.email, rescheduledMail(view), ics))) note("email-prospect", "La confirmation du déplacement n'est pas partie.");
  const clientId = idOf(b.client);
  const taskId = idOf(b.task);
  if (taskId) {
    const task = taskContent(t, next, host.name, problems);
    await payload.update({ collection: "client-activities", id: taskId, data: { dueDate: at, title: task.title.slice(0, 200), content: `Déplacé par le prospect.\n${task.content}`, highPriority: task.highPriority } as never, overrideAccess: true }).catch(() => note("crm", "La tâche du CRM n'a pas été déplacée."));
  }
  if (t.notifyHost || problems.length) {
    const mail = hostMail(view, "deplace", { problems: problems.map(problemText), clientUrl: clientId ? adminUrl(`/collections/partner-clients/${clientId}`) : null, bookingUrl: adminUrl(`/collections/bookings/${String(b.id)}`) });
    if (!host.email || !(await send(payload, host.email, mail))) note("email-equipe", "L'avis du déplacement n'est pas parti.");
  }
  await payload.update({ collection: "bookings" as never, id: String(b.id), data: { meetingUrl, eventId, calendarId } as never, overrideAccess: true }).catch(() => null);
  await appendProblems(payload, b, problems);
  return { ok: true, booking: { start: at, end, host: host.name, meetingUrl, manage: token, problems: problems.length } };
}

export async function cancel(payload: Payload, token: string, reason: string, now = new Date()): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const found = await bookingByToken(payload, token);
  if (!found) return { ok: false, status: 404, error: "Rendez-vous introuvable." };
  const { booking: b, type: t } = found;
  const refused = canChange(t, b, "annuler", now);
  if (refused) return { ok: false, status: 400, error: refused };
  const problems: Problem[] = [];
  const why = reason.trim().slice(0, 1000) || null;
  await payload.update({ collection: "bookings" as never, id: String(b.id), data: { status: "annule", slotKey: null, cancelReason: why, cancelledBy: "prospect" } as never, overrideAccess: true });
  const host = t.hosts.find((h) => h.id === idOf(b.host));
  const hostName = host?.name ?? "l'équipe";
  if (b.eventId && b.calendarId) {
    const cal = await calendarFor(payload, host?.partner ?? null);
    if (cal) await getProvider(cal.connection.provider)!.deleteEvent(cal.token, String(b.calendarId), String(b.eventId)).catch(() => problems.push({ kind: "agenda-evenement", message: "L'événement n'a pas été retiré de l'agenda.", at: new Date().toISOString() }));
  }
  const view = mailView(t, b, hostName);
  const rebook = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co").replace(/\/$/, "")}${bookingPath(t.slug)}`;
  if (!(await send(payload, view.email, cancelledMail(view, rebook), icsFile(view, whereFr(view), { method: "CANCEL", sequence: num(b.rescheduledCount, 0) + 1, organizerEmail: host?.email ?? "contact@tim-management.co" }))))
    problems.push({ kind: "email-prospect", message: "La confirmation d'annulation n'est pas partie.", at: new Date().toISOString() });
  // Le CRM : la réunion tombe, une relance la remplace — un prospect qui annule reste à rappeler.
  const clientId = idOf(b.client);
  const taskId = idOf(b.task);
  if (taskId) await payload.update({ collection: "client-activities", id: taskId, data: { done: true, doneAt: new Date().toISOString(), content: `Annulé par le prospect${why ? ` : « ${why} »` : "."}` } as never, overrideAccess: true }).catch(() => null);
  if (clientId)
    await payload
      .create({ collection: "client-activities", data: { client: relId(clientId), type: "tache", taskKind: "appel", title: `Rappeler ${String(b.firstName)} ${String(b.lastName)} : rendez-vous « ${t.name} » annulé`, dueDate: new Date().toISOString(), content: `Le prospect a annulé le rendez-vous du ${whenFr(String(b.start))}${why ? ` : « ${why} »` : "."}\n${String(b.phone ?? "")}`, highPriority: true } as never, overrideAccess: true })
      .catch(() => null);
  if (host?.email && t.notifyHost) {
    const mail = hostMail(view, "annule", { problems: problems.map(problemText), reason: why, clientUrl: clientId ? adminUrl(`/collections/partner-clients/${clientId}`) : null, bookingUrl: adminUrl(`/collections/bookings/${String(b.id)}`) });
    await send(payload, host.email, mail);
  }
  await appendProblems(payload, b, problems);
  return { ok: true };
}

/* ─── Comment il nous a connus (un clic) ───────────────────────────────── */

/**
 * La réponse à « Comment nous avez-vous connus ? » : depuis l'écran « C'est confirmé » (le jeton du rendez-vous) ou
 * l'e-mail d'accusé de réception (la référence signée de la demande). Elle va sur le rendez-vous et sur la fiche du
 * prospect ; un second clic corrige le premier. Rend false si la référence ne mène à rien.
 */
export async function recordHeardFrom(payload: Payload, ref: { token?: string | null; submission?: string | null }, value: string): Promise<boolean> {
  let clientId: string | null = null;
  if (ref.token) {
    const found = await bookingByToken(payload, ref.token);
    if (!found) return false;
    await payload.update({ collection: "bookings" as never, id: String(found.booking.id), data: { heardFrom: value } as never, overrideAccess: true }).catch(() => null);
    clientId = idOf(found.booking.client);
  } else if (ref.submission) {
    const s = (await payload.findByID({ collection: "form-submissions", id: ref.submission, depth: 0, overrideAccess: true }).catch(() => null)) as Raw | null;
    if (!s) return false;
    clientId = idOf(s.client);
  } else return false;
  if (clientId) await payload.update({ collection: "partner-clients", id: clientId, data: { heardFrom: value } as never, overrideAccess: true }).catch((e) => payload.logger.warn(`[rendez-vous] « nous a connus » non noté sur ${clientId} : ${e}`));
  return true;
}
