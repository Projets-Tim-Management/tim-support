import type { Payload } from "payload";

/**
 * Rattachement d'un e-mail à une opportunité.
 *
 * C'est le cœur de la remontée des échanges dans l'historique d'une fiche, et
 * il sera le même quelle que soit la façon dont le message nous arrive : une
 * copie cachée aujourd'hui, une boîte Gmail synchronisée demain. D'où un module
 * à part, testable sans base ni webhook.
 *
 * La règle de conservation tient en une phrase : on n'écrit QUE si l'une des
 * adresses du fil correspond à une opportunité déjà connue. Tout le reste est
 * lu, comparé, puis oublié — jamais stocké. C'est ce qui rend le dispositif
 * proportionné : la finalité est le suivi d'un prospect, pas l'archivage de la
 * correspondance de quelqu'un.
 */

/** Une adresse, sous l'une des formes que produisent les webhooks. */
type RawAddress = string | { Address?: string; address?: string; Name?: string; name?: string };

/** Message reçu, indépendant de la source qui l'a fourni. */
export interface IncomingMessage {
  from?: RawAddress | RawAddress[] | null;
  /** Destinataires VISIBLES. Surtout pas les destinataires d'enveloppe : ils
   *  contiennent l'adresse de capture, qui ne désigne personne. */
  to?: RawAddress | RawAddress[] | null;
  cc?: RawAddress | RawAddress[] | null;
  subject?: string | null;
  text?: string | null;
  /** Noms des pièces jointes. On ne conserve pas les fichiers. */
  attachments?: { Name?: string; name?: string; filename?: string }[] | null;
  /** En-tête Message-ID, pour ne pas écrire deux fois le même message. */
  messageId?: string | null;
  date?: string | null;
}

const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/**
 * Les deux formes de l'adresse de capture.
 *
 * Celle qu'on tape vit sur le domaine principal (`suivi@tim-management.co`),
 * dont les MX sont chez Google ; un groupe Workspace la renvoie vers le même
 * nom sur `REPLY_DOMAIN`, dont les MX sont chez Brevo — c'est celle-là qui
 * arrive au webhook. On reconnaît les deux : la première apparaît dans les
 * en-têtes le jour où quelqu'un la met en Cc au lieu de Cci, la seconde dans
 * les destinataires d'enveloppe le reste du temps.
 */
export function captureAddresses(): string[] {
  const addr = process.env.EMAIL_CAPTURE_ADDRESS?.trim().toLowerCase();
  if (!addr?.includes("@")) return [];
  const domain = process.env.REPLY_DOMAIN?.trim().toLowerCase();
  const routed = domain ? `${addr.split("@")[0]}@${domain}` : null;
  return routed && routed !== addr ? [addr, routed] : [addr];
}

/** Extrait une adresse d'une des formes possibles. `null` si elle n'en contient pas. */
export function readAddress(value: RawAddress | null | undefined): string | null {
  if (!value) return null;
  const raw =
    typeof value === "string"
      ? value
      : (value.Address ?? value.address ?? "");
  const found = EMAIL.exec(String(raw));
  return found ? found[0].toLowerCase() : null;
}

/** Aplati les formes multiples en liste d'adresses, sans doublon. */
export function readAddresses(value: IncomingMessage["to"]): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else {
      const a = readAddress(v as RawAddress);
      if (a && !out.includes(a)) out.push(a);
    }
  };
  walk(value);
  return out;
}

/**
 * Les adresses qui peuvent désigner un prospect.
 *
 * L'expéditeur d'abord — c'est lui qui décide du SENS du message — puis les
 * destinataires visibles. L'adresse de capture en est retirée : elle est dans
 * tous les messages et ne désigne personne.
 */
export function correspondents(msg: IncomingMessage, captureAddress?: string): string[] {
  const capture = captureAddress?.trim().toLowerCase();
  const all = [...readAddresses(msg.from), ...readAddresses(msg.to), ...readAddresses(msg.cc)];
  return all.filter((a, i) => all.indexOf(a) === i && a !== capture);
}

/** Noms des pièces jointes — les fichiers, eux, ne sont pas conservés. */
export function attachmentNames(msg: IncomingMessage): string[] {
  return (msg.attachments ?? [])
    .map((a) => (a?.Name ?? a?.name ?? a?.filename ?? "").trim())
    .filter(Boolean);
}

/** Objet nettoyé des préfixes de réponse et de transfert accumulés. */
export function cleanSubject(subject?: string | null): string {
  const s = (subject ?? "").replace(/\s+/g, " ").trim();
  return s.replace(/^((re|ré|rép|fwd|fw|tr)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}

/**
 * Le message SEUL, sans le fil qu'il cite.
 *
 * Une réponse embarque tout l'échange précédent. Sans cette coupe, la
 * chronologie d'une fiche afficherait dix fois la même conversation, chacune un
 * peu plus longue que la précédente — et on ne verrait plus ce qui vient d'être
 * écrit, qui est la seule chose qu'on venait lire.
 *
 * Reconnaît les marqueurs français et anglais, Gmail comme Outlook. En cas de
 * doute on garde TOUT : un message tronqué à tort est pire qu'un message trop
 * long, parce que rien ne le signale.
 */
const QUOTE_MARKERS = [
  /^\s*le\s.+\sa\s(écrit|ecrit)\s*:/i,
  /^\s*on\s.+\swrote\s*:/i,
  /^\s*-{2,}\s*(message d'origine|original message|forwarded message)\s*-{2,}/i,
  /^\s*De\s*:\s*.+$/i,
  /^\s*From\s*:\s*.+$/i,
  /^\s*_{5,}\s*$/,
];

export function stripQuoted(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (QUOTE_MARKERS.some((re) => re.test(lines[i]))) {
      const kept = lines.slice(0, i).join("\n").trim();
      // Une citation en tête de message (un transfert commenté d'une ligne) ne
      // doit pas tout effacer : dans ce cas on préfère garder le message entier.
      return kept.length >= 20 ? kept : text.trim();
    }
  }
  return text.trim();
}

export interface Match {
  clientId: number;
  /** L'adresse de l'opportunité qui a permis le rattachement. */
  matchedOn: string;
}

/**
 * L'opportunité désignée par l'une des adresses du fil.
 *
 * Cherchée d'abord sur la fiche elle-même, puis sur ses contacts : un échange
 * part souvent vers l'assistante ou le conducteur de travaux, pas vers
 * l'adresse principale.
 *
 * Plusieurs opportunités peuvent partager une adresse (une entreprise
 * recontactée l'année suivante). On retient la plus RÉCEMMENT modifiée : c'est
 * celle sur laquelle on travaille, et donc celle où l'on cherchera l'échange.
 *
 * @returns `null` si aucune adresse ne correspond — et dans ce cas rien n'est
 * écrit nulle part. C'est voulu : on ne fabrique pas de fiche à partir de la
 * correspondance de quelqu'un.
 */
export async function findOpportunity(
  payload: Payload,
  addresses: string[],
): Promise<Match | null> {
  if (addresses.length === 0) return null;

  const direct = await payload
    .find({
      collection: "partner-clients",
      where: { email: { in: addresses } },
      sort: "-updatedAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);

  const doc = direct?.docs?.[0] as { id: number; email?: string } | undefined;
  if (doc) return { clientId: doc.id, matchedOn: doc.email ?? addresses[0] };

  const contact = await payload
    .find({
      collection: "client-contacts",
      where: { email: { in: addresses } },
      sort: "-updatedAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);

  const found = contact?.docs?.[0] as { client?: unknown; email?: string } | undefined;
  if (!found) return null;

  const clientId =
    found.client && typeof found.client === "object"
      ? (found.client as { id?: unknown }).id
      : found.client;
  const id = Number(clientId);
  return Number.isFinite(id) ? { clientId: id, matchedOn: found.email ?? addresses[0] } : null;
}

/**
 * Sens du message, du point de vue de la fiche.
 *
 * Déterminé par l'EXPÉDITEUR et lui seul : si c'est le prospect qui écrit, le
 * message est reçu ; dans tous les autres cas il part de chez nous. Se fier aux
 * destinataires serait faux dès qu'un fil compte plusieurs personnes.
 */
export function direction(msg: IncomingMessage, matchedOn: string): "recu" | "envoye" {
  return readAddresses(msg.from).includes(matchedOn.toLowerCase()) ? "recu" : "envoye";
}

export interface CaptureResult {
  /** `null` quand rien n'a été écrit — la raison le dit. */
  activityId: number | string | null;
  reason: "ecrit" | "aucune-opportunite" | "deja-connu" | "message-vide";
  clientId?: number;
}

/**
 * Écrit l'échange sur la fiche de l'opportunité, s'il y en a une.
 *
 * Idempotent par le `Message-ID` : un même message peut nous parvenir deux fois
 * — deux partenaires en copie du même fil, un renvoi, une reprise du webhook
 * après une erreur. Sans ce garde-fou, l'historique doublerait chaque échange.
 */
export async function captureEmail(
  payload: Payload,
  msg: IncomingMessage,
  { captureAddress }: { captureAddress?: string } = {},
): Promise<CaptureResult> {
  const body = (msg.text ?? "").trim();
  const names = attachmentNames(msg);
  // Ni texte ni pièce jointe : il n'y a rien à montrer sur une fiche.
  if (!body && names.length === 0) return { activityId: null, reason: "message-vide" };

  const match = await findOpportunity(payload, correspondents(msg, captureAddress));
  if (!match) return { activityId: null, reason: "aucune-opportunite" };

  const messageId = msg.messageId?.trim() || null;
  if (messageId) {
    const seen = await payload.count({
      collection: "client-activities",
      where: { sourceMessageId: { equals: messageId } },
      overrideAccess: true,
    });
    if (seen.totalDocs > 0) {
      return { activityId: null, reason: "deja-connu", clientId: match.clientId };
    }
  }

  const sens = direction(msg, match.matchedOn);
  const subject = cleanSubject(msg.subject) || "(sans objet)";
  const from = readAddresses(msg.from)[0];
  const visibles = [...readAddresses(msg.to), ...readAddresses(msg.cc)].filter(
    (a) => a !== captureAddress?.toLowerCase(),
  );

  const created = await payload.create({
    collection: "client-activities",
    data: {
      client: match.clientId,
      type: "email",
      title: sens === "recu" ? `Reçu — ${subject}` : `Envoyé — ${subject}`,
      content: body,
      // La date du message, pas celle de la capture : un fil transféré le
      // lendemain doit se ranger au bon endroit dans la chronologie.
      occurredAt: msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
      recipients: (sens === "recu" ? [from, ...visibles] : visibles).filter(Boolean).join(", "),
      emailDirection: sens,
      sourceMessageId: messageId,
      attachmentNames: names.join(", ") || undefined,
    } as never,
    overrideAccess: true,
  });

  return { activityId: created.id, reason: "ecrit", clientId: match.clientId };
}
