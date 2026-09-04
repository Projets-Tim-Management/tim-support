/**
 * Lecture d'une boîte Gmail.
 *
 * Le principe qui commande tout le module : on descend d'abord les
 * MÉTADONNÉES — expéditeur, destinataires, objet, date — et on ne va chercher
 * le CONTENU d'un message qu'une fois qu'on sait qu'il concerne une opportunité
 * connue.
 *
 * Ce n'est pas une optimisation. C'est la promesse faite à la personne qui
 * connecte sa boîte : le reste de sa correspondance n'est jamais téléchargé,
 * pas même en mémoire, pas même une seconde. Inverser l'ordre marcherait aussi
 * bien et rendrait cette promesse fausse.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Un appel qui reste sans réponse suspendrait tout le passage. */
const CALL_TIMEOUT_MS = 15_000;

/**
 * Gmail compte en « unités de quota » par minute et par utilisateur, pas en
 * requêtes. Lire les métadonnées de quelques centaines de messages suffit à
 * l'atteindre, et Google répond alors 403 « Quota exceeded » — pas 429.
 *
 * C'est un refus TEMPORAIRE, et le traiter comme une erreur définitive faisait
 * silencieusement disparaître des messages d'un passage : ils n'étaient ni
 * rattachés, ni signalés autrement qu'en avertissement. On attend, et on
 * réessaie.
 */
const isRateLimited = (status: number, message: string): boolean =>
  status === 429 || (status === 403 && /quota|rate limit/i.test(message));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(accessToken: string, path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body as T;

  const message = (body as { error?: { message?: string } })?.error?.message ?? res.statusText;

  /**
   * Attente doublée à chaque essai, avec une part d'aléatoire : sans elle, dix
   * appels refusés ensemble repartiraient ensemble et se feraient refuser
   * ensemble. Quatre essais couvrent largement la fenêtre d'une minute.
   */
  if (isRateLimited(res.status, message) && attempt < 4) {
    await wait(2 ** attempt * 1500 + Math.random() * 500);
    return api<T>(accessToken, path, attempt + 1);
  }

  throw new Error(`Gmail (${res.status}) : ${message}`);
}

/** En-têtes demandés — et aucun autre. */
const HEADERS = ["From", "To", "Cc", "Subject", "Date", "Message-ID"];

export interface MessageMeta {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;
  messageId?: string;
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
};

const header = (msg: GmailMessage, name: string): string | undefined =>
  msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;

/**
 * Identifiants des messages à examiner, sur une fenêtre donnée.
 *
 * `q` exclut les brouillons, la corbeille, les indésirables et les
 * conversations Chat : aucun n'est un échange avec un prospect, et les lire
 * reviendrait à élargir la lecture sans rien y gagner.
 */
export async function listMessageIds(
  accessToken: string,
  { since, max = 2000 }: { since: Date; max?: number },
): Promise<string[]> {
  // Gmail attend `after:` au format AAAA/MM/JJ, en heure locale du compte.
  const after = `${since.getFullYear()}/${since.getMonth() + 1}/${since.getDate()}`;
  /**
   * Les notifications d'agenda sont écartées ici plutôt qu'après coup.
   *
   * « Invitation acceptée », « Événement modifié » : ce sont des messages
   * fabriqués par Google, pas des échanges. Les laisser passer remplirait la
   * chronologie d'une fiche de lignes que personne n'a écrites — et les lire
   * pour les jeter ensuite reviendrait à ouvrir des messages pour rien.
   */
  const q = encodeURIComponent(
    `after:${after} -in:chats -in:drafts -in:trash -in:spam ` +
      "-from:calendar-notification@google.com -from:noreply@google.com",
  );

  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(
      accessToken,
      `/messages?q=${q}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);

  return ids.slice(0, max);
}

/**
 * Les métadonnées de plusieurs messages, par petits paquets.
 *
 * Une boîte d'un an contient des milliers de messages, et Gmail répond en
 * quelques centaines de millisecondes : à la file, un passage prendrait des
 * dizaines de minutes et dépasserait le délai d'une tâche planifiée.
 *
 * Cinq en parallèle, et pas dix : à dix, le quota par minute saute au bout de
 * quelques centaines de messages — constaté, pas supposé. Les refus sont
 * rattrapés par l'attente progressive d'`api`, mais mieux vaut ne pas les
 * provoquer : chaque refus coûte plus de temps qu'il n'en fait gagner.
 */
export async function getMetadataBatch(
  accessToken: string,
  ids: string[],
  onError?: (id: string, err: unknown) => void,
  concurrency = 5,
): Promise<MessageMeta[]> {
  const out: MessageMeta[] = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const chunk = await Promise.all(
      ids.slice(i, i + concurrency).map((id) =>
        getMetadata(accessToken, id).catch((e) => {
          onError?.(id, e);
          return null;
        }),
      ),
    );
    for (const m of chunk) if (m) out.push(m);
  }
  return out;
}

/** Métadonnées seules — le contenu du message n'est PAS téléchargé. */
export async function getMetadata(accessToken: string, id: string): Promise<MessageMeta> {
  const params = HEADERS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join("&");
  const msg = await api<GmailMessage>(accessToken, `/messages/${id}?format=metadata&${params}`);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: header(msg, "From"),
    to: header(msg, "To"),
    cc: header(msg, "Cc"),
    subject: header(msg, "Subject"),
    date: header(msg, "Date") ?? (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined),
    messageId: header(msg, "Message-ID"),
  };
}

const decode = (data?: string): string =>
  data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";

/**
 * Le texte du message, et le nom de ses pièces jointes.
 *
 * `text/plain` d'abord : c'est ce qu'a écrit la personne. On ne se rabat sur le
 * HTML que s'il n'y a rien d'autre, en le dépouillant de ses balises — un corps
 * HTML brut dans une chronologie est illisible.
 */
function walk(part: GmailPart | undefined, out: { plain: string[]; html: string[]; files: string[] }): void {
  if (!part) return;
  const name = part.filename?.trim();
  if (name) out.files.push(name);
  else if (part.mimeType === "text/plain") out.plain.push(decode(part.body?.data));
  else if (part.mimeType === "text/html") out.html.push(decode(part.body?.data));
  for (const child of part.parts ?? []) walk(child, out);
}

const stripHtml = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function getContent(
  accessToken: string,
  id: string,
): Promise<{ text: string; attachments: string[] }> {
  const msg = await api<GmailMessage>(accessToken, `/messages/${id}?format=full`);
  const out = { plain: [] as string[], html: [] as string[], files: [] as string[] };
  walk(msg.payload, out);

  const plain = out.plain.join("\n").trim();
  return {
    text: plain || stripHtml(out.html.join("\n")),
    attachments: out.files,
  };
}
