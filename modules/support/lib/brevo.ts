/**
 * Suivi des e-mails d'un ticket via l'API Brevo v3.
 *
 * Le compte Brevo est PARTAGÉ avec l'application principale (exports, alertes…) :
 * filtrer sur la seule adresse du demandeur remonterait des e-mails sans rapport.
 * Chaque envoi lié à un ticket porte donc un tag `ticket-<numéro>` (en-tête SMTP
 * `X-Mailin-Tag`), et c'est sur ce tag qu'on interroge l'API.
 *
 * Lecture seule, avec la clé API v3 (`BREVO_API_KEY`) — distincte de la clé SMTP
 * d'envoi. Sans clé configurée, la fonctionnalité se désactive proprement.
 */

const API = "https://api.brevo.com/v3/smtp/statistics/events";

/** Tag Brevo d'un ticket — même valeur à l'envoi et à la lecture. */
export const ticketTag = (number: number | string) => `ticket-${number}`;

/**
 * En-têtes à joindre à `payload.sendEmail` pour tracer l'envoi.
 * L'adaptateur nodemailer transmet `headers` tel quel au relais SMTP.
 */
export const ticketMailHeaders = (number: number | string | undefined | null) =>
  number == null ? {} : { headers: { "X-Mailin-Tag": ticketTag(number) } };

export interface BrevoSender {
  id: number;
  name: string;
  email: string;
  /** Vrai quand l'expéditeur est vérifié côté Brevo (seul cas envoyable). */
  active: boolean;
}

/**
 * Expéditeurs vérifiés du compte Brevo. Envoyer depuis une adresse absente de
 * cette liste est refusé par Brevo — d'où la validation côté serveur avant envoi.
 * L'adresse par défaut reste `EMAIL_FROM` (le support).
 */
export async function getSenders(): Promise<BrevoSender[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": key, accept: "application/json" },
      // Les expéditeurs changent rarement : une heure de cache suffit largement.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { senders?: BrevoSender[] };
    return (json.senders ?? []).filter((s) => s.active);
  } catch {
    return [];
  }
}

export interface BrevoEvent {
  date: string;
  event: string;
  email: string;
  subject?: string;
  messageId?: string;
  tag?: string;
  reason?: string;
  link?: string;
}

export interface TicketEmailActivity {
  /** Événements des e-mails tagués pour CE ticket. */
  events: BrevoEvent[];
  /** Autres e-mails envoyés à la même adresse (contexte, hors ticket). */
  otherToAddress: BrevoEvent[];
  /** `false` quand BREVO_API_KEY n'est pas configurée. */
  configured: boolean;
  error?: string;
}

async function query(params: Record<string, string>): Promise<BrevoEvent[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return [];
  const url = `${API}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { "api-key": key, accept: "application/json" },
    // Statistiques : jamais mises en cache, l'intérêt est de voir l'état courant.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}`);
  const json = (await res.json()) as { events?: BrevoEvent[] };
  return json.events ?? [];
}

/**
 * Activité e-mail d'un ticket. `days` est plafonné à 90 par l'API Brevo — au-delà,
 * l'historique n'est plus consultable (cf. limite documentée de l'endpoint).
 */
export async function getTicketEmailActivity(
  number: number | string | undefined | null,
  email: string | undefined | null,
  days = 90,
): Promise<TicketEmailActivity> {
  if (!process.env.BREVO_API_KEY) {
    return { events: [], otherToAddress: [], configured: false };
  }
  try {
    const base = { days: String(Math.min(days, 90)), limit: "200", sort: "desc" };
    // ⚠️ `tags` attend le tag BRUT (`ticket-42`), malgré la documentation Brevo
    // qui annonce « un tableau sérialisé ». Vérifié sur l'API : `["ticket-42"]`
    // renvoie 0 événement, `ticket-42` les renvoie tous.
    const [tagged, byAddress] = await Promise.all([
      number != null ? query({ ...base, tags: ticketTag(number) }) : Promise.resolve([]),
      email ? query({ ...base, email, limit: "50" }) : Promise.resolve([]),
    ]);

    const taggedIds = new Set(tagged.map((e) => e.messageId));
    return {
      configured: true,
      events: tagged,
      // On ne répète pas ici ce qui est déjà rattaché au ticket.
      otherToAddress: byAddress.filter((e) => !taggedIds.has(e.messageId)),
    };
  } catch (e) {
    return {
      events: [],
      otherToAddress: [],
      configured: true,
      error: e instanceof Error ? e.message : "Appel Brevo impossible",
    };
  }
}
