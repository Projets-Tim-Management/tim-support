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
 *
 * SEULE EXCEPTION à la lecture seule : `requestSenderVerification`, qui inscrit
 * une adresse d'expédition. C'est la seule façon d'obtenir qu'un e-mail parte
 * réellement de l'adresse d'un partenaire (voir sa documentation).
 */

const API = "https://api.brevo.com/v3/smtp/statistics/events";

/** Tag Brevo d'un ticket — même valeur à l'envoi et à la lecture. */
export const ticketTag = (number: number | string) => `ticket-${number}`;

/**
 * Tag Brevo d'une phase de test.
 *
 * Même principe que pour les tickets, et pour la même raison : le compte Brevo
 * est partagé, et filtrer sur la seule adresse du client remonterait aussi ses
 * tickets et les messages de son partenaire. Le tag rattache un envoi À CE
 * parcours, sans ambiguïté.
 */
export const journeyTag = (runId: number | string) => `run-${runId}`;

/**
 * En-têtes à joindre à `payload.sendEmail` pour tracer l'envoi.
 * L'adaptateur nodemailer transmet `headers` tel quel au relais SMTP.
 */
export const ticketMailHeaders = (number: number | string | undefined | null) =>
  number == null ? {} : { headers: { "X-Mailin-Tag": ticketTag(number) } };

/** Idem pour un envoi de parcours. */
export const journeyMailHeaders = (runId: number | string | undefined | null) =>
  runId == null ? {} : { headers: { "X-Mailin-Tag": journeyTag(runId) } };

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
export async function getSenders({ fresh = false }: { fresh?: boolean } = {}): Promise<BrevoSender[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.brevo.com/v3/senders", {
      headers: { "api-key": key, accept: "application/json" },
      // Les expéditeurs changent rarement : une heure de cache suffit pour
      // PEUPLER une liste. Mais quand la réponse DÉCIDE d'un envoi, il faut
      // l'état réel : une adresse qu'on vient de faire vérifier resterait
      // refusée pendant une heure, sans aucun moyen de forcer la relecture.
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 3600 } }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { senders?: BrevoSender[] };
    return (json.senders ?? []).filter((s) => s.active);
  } catch {
    return [];
  }
}

/**
 * Inscrit une adresse comme EXPÉDITEUR du compte Brevo.
 *
 * Pourquoi c'est nécessaire : Brevo refuse tout envoi depuis une adresse qui ne
 * figure pas dans ses expéditeurs. Tant qu'elle n'y est pas, l'e-mail d'un
 * partenaire part de l'adresse du support — ce n'est pas ce qu'on veut.
 *
 * Ce qui se passe ensuite dépend du DOMAINE de l'adresse :
 *  - domaine déjà AUTHENTIFIÉ sur le compte (DNS/DKIM — c'est le cas de
 *    tim-management.co et .fr) : l'adresse est utilisable tout de suite ;
 *  - domaine externe (celui du partenaire) : Brevo envoie un e-mail de
 *    validation À CETTE ADRESSE, et son propriétaire doit cliquer le lien. Sans
 *    ce clic, rien ne part de chez lui — et c'est heureux : c'est exactement ce
 *    qui empêche d'usurper l'adresse de quelqu'un d'autre.
 *
 * @returns `already` si l'adresse était déjà connue, `requested` si la demande
 *          vient de partir, `error` avec le message de Brevo sinon.
 */
export async function requestSenderVerification(
  email: string,
  name: string,
): Promise<{ status: "already" | "requested" | "error"; message?: string }> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { status: "error", message: "Clé API Brevo non configurée." };

  const existing = await getSenders({ fresh: true });
  if (existing.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
    return { status: "already" };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/senders", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, name }),
    });
    if (res.ok) return { status: "requested" };
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    // Brevo renvoie « duplicate_parameter » si l'adresse existe déjà mais reste
    // inactive : la demande est donc déjà partie, ce n'est pas une erreur.
    if (res.status === 400 && /duplicate/i.test(json?.message ?? "")) {
      return { status: "already" };
    }
    return { status: "error", message: json?.message ?? `Brevo ${res.status}` };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

/** Un enregistrement DNS à ajouter chez l'hébergeur du domaine. */
export interface DomainRecord {
  /** Clé Brevo (brevo_code, dkim_record, dmarc_record). */
  key: string;
  host: string;
  type: string;
  value: string;
  /** Vrai quand Brevo constate que l'enregistrement est en place. */
  ok: boolean;
}

export interface DomainStatus {
  domain: string;
  /** DNS en place : les envois depuis ce domaine sont signés (SPF/DKIM). */
  authenticated: boolean;
  verified: boolean;
  records: DomainRecord[];
}

const toRecords = (raw: unknown): DomainRecord[] =>
  Object.entries((raw ?? {}) as Record<string, Record<string, unknown>>).map(([key, r]) => ({
    key,
    host: String(r?.host_name ?? ""),
    type: String(r?.type ?? "TXT"),
    value: String(r?.value ?? ""),
    ok: Boolean(r?.status),
  }));

/**
 * État d'authentification d'un domaine d'envoi, avec ses enregistrements DNS.
 *
 * C'est CE qui décide si un e-mail peut réellement partir de l'adresse d'un
 * partenaire. Sans domaine authentifié, Brevo signe le message avec ses propres
 * clés : le destinataire voit une adresse dont rien ne prouve l'origine, et les
 * politiques DMARC modernes le rangent en indésirables.
 *
 * Le domaine est CRÉÉ s'il n'existe pas encore sur le compte (`create`) — c'est
 * ce qui produit les trois enregistrements à transmettre à l'hébergeur.
 */
export async function getDomainStatus(
  domain: string,
  { create = false }: { create?: boolean } = {},
): Promise<DomainStatus | null> {
  const key = process.env.BREVO_API_KEY;
  if (!key || !domain) return null;
  const headers = { "api-key": key, accept: "application/json" };

  const read = await fetch(`https://api.brevo.com/v3/senders/domains/${encodeURIComponent(domain)}`, {
    headers,
    cache: "no-store",
  });
  if (read.ok) {
    const json = (await read.json()) as Record<string, unknown>;
    return {
      domain,
      authenticated: Boolean(json.authenticated),
      verified: Boolean(json.verified),
      records: toRecords(json.dns_records),
    };
  }
  if (!create) return null;

  const made = await fetch("https://api.brevo.com/v3/senders/domains", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name: domain }),
  });
  if (!made.ok) return null;
  const json = (await made.json()) as Record<string, unknown>;
  return {
    domain,
    authenticated: false,
    verified: false,
    records: toRecords(json.dns_records),
  };
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

export interface EmailActivity {
  /** Événements des e-mails portant le tag demandé. */
  events: BrevoEvent[];
  /** Autres e-mails envoyés à la même adresse (contexte). */
  otherToAddress: BrevoEvent[];
  /** `false` quand BREVO_API_KEY n'est pas configurée. */
  configured: boolean;
  error?: string;
}

/** Conservé pour le module support, dont c'est le nom historique. */
export type TicketEmailActivity = EmailActivity;

/**
 * Activité e-mail d'un objet tagué (ticket, parcours…), plus le contexte de
 * l'adresse. `days` est plafonné à 90 par l'API Brevo — au-delà, l'historique
 * n'est plus consultable (limite documentée de l'endpoint).
 *
 * Les deux listes sont utiles et différentes : la première dit ce qui est parti
 * POUR CET OBJET, la seconde ce que la personne a reçu par ailleurs — c'est
 * elle qui explique un « je n'ai rien vu » quand la boîte est saturée.
 */
export async function getEmailActivity(
  tag: string | null,
  email: string | undefined | null,
  days = 90,
): Promise<EmailActivity> {
  if (!process.env.BREVO_API_KEY) {
    return { events: [], otherToAddress: [], configured: false };
  }
  try {
    const base = { days: String(Math.min(days, 90)), limit: "200", sort: "desc" };
    // ⚠️ `tags` attend le tag BRUT (`ticket-42`, `run-9`), malgré la
    // documentation Brevo qui annonce « un tableau sérialisé ». Vérifié sur
    // l'API : `["ticket-42"]` renvoie 0 événement, `ticket-42` les renvoie tous.
    const [tagged, byAddress] = await Promise.all([
      tag ? query({ ...base, tags: tag }) : Promise.resolve([]),
      email ? query({ ...base, email, limit: "100" }) : Promise.resolve([]),
    ]);
    const taggedIds = new Set(tagged.map((e) => e.messageId));
    return {
      configured: true,
      events: tagged,
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
 * Événements qui valent une inscription définitive sur la liste de suppression.
 *
 * `unsubscribed` : la personne a cliqué « se désabonner » côté Brevo.
 * `hardBounces`  : l'adresse n'existe pas — continuer d'écrire abîme la
 *                  réputation d'expéditeur, donc la délivrabilité de TOUT le
 *                  reste, e-mails de tickets compris.
 * `spam`         : une plainte. La pire des trois, et la plus coûteuse.
 *
 * Les rejets TEMPORAIRES (`softBounces`) n'y sont pas : une boîte pleine se
 * vide, un serveur qui tousse repart. Les y mettre supprimerait des prospects
 * joignables.
 */
export const SUPPRESSION_EVENTS = ["unsubscribed", "hardBounces", "spam"] as const;

/**
 * Tous les événements de suppression sur une fenêtre donnée, toutes campagnes
 * confondues.
 *
 * `days` est plafonné à 90 par l'API Brevo. La pagination est explicite : sans
 * elle, une journée chargée serait tronquée à la première page et des
 * désinscriptions passeraient à la trappe — sans que rien ne le signale.
 */
export async function fetchSuppressionEvents(days = 7): Promise<BrevoEvent[]> {
  if (!process.env.BREVO_API_KEY) return [];
  const out: BrevoEvent[] = [];
  const PAGE = 100;

  for (const event of SUPPRESSION_EVENTS) {
    for (let offset = 0; offset < 5000; offset += PAGE) {
      const page = await query({
        days: String(Math.min(days, 90)),
        limit: String(PAGE),
        offset: String(offset),
        sort: "desc",
        event,
      });
      out.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return out;
}

/** Activité e-mail d'un ticket : le tag du ticket, plus le reste de l'adresse. */
export const getTicketEmailActivity = (
  number: number | string | undefined | null,
  email: string | undefined | null,
  days = 90,
): Promise<EmailActivity> =>
  getEmailActivity(number == null ? null : ticketTag(number), email, days);
