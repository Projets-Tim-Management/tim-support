import type { Payload } from "payload";

/**
 * Les pièces jointes d'un e-mail ENTRANT (réponse d'un client à un ticket).
 *
 * Brevo ne transmet pas les fichiers dans le webhook : seulement leur nom, leur
 * type et un jeton de téléchargement (`DownloadToken`). Ce jeton n'existe que
 * dans le webhook — l'API des évènements entrants ne le redonne pas. Un webhook
 * qui l'ignore perd donc la pièce pour de bon : c'est ce qui arrivait aux
 * captures d'écran collées dans les réponses (ticket #3193, 02/11/2026).
 *
 * On télécharge ici chaque pièce retenue, on la range dans les médias, et le
 * message du fil la porte. Une pièce qui échoue est sautée (dite dans les logs) :
 * le message, lui, est toujours enregistré.
 */

export type InboundAttachment = {
  Name?: string;
  ContentType?: string;
  ContentLength?: number;
  /** Présent sur une image COLLÉE dans le corps (référencée par `cid:`). */
  ContentID?: string;
  DownloadToken?: string;
};

/** Images, PDF, bureautique : ce qu'un client envoie pour expliquer son problème. */
const ACCEPTED_MIME =
  /^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|vnd\.oasis\.opendocument\.[a-z.]+))$/;
export const MAX_INBOUND_SIZE = 10 * 1024 * 1024; // 10 Mo
export const MAX_INBOUND_FILES = 10;
/**
 * Sous ce poids, une image COLLÉE est un logo de signature (facebook.png,
 * logo-entreprise.png) : la ranger encombrerait chaque réponse du même client.
 * Une vraie capture d'écran pèse bien plus.
 */
const SIGNATURE_IMAGE_MAX = 8 * 1024;

/** Les pièces à récupérer, dans l'ordre de l'e-mail. Pure. */
export function selectInboundAttachments(list: unknown): InboundAttachment[] {
  if (!Array.isArray(list)) return [];
  return (list as InboundAttachment[])
    .filter((a) => a && typeof a.DownloadToken === "string" && a.DownloadToken)
    .filter((a) => ACCEPTED_MIME.test((a.ContentType ?? "").toLowerCase()))
    .filter((a) => (a.ContentLength ?? 0) <= MAX_INBOUND_SIZE)
    .filter((a) => !(a.ContentID && (a.ContentType ?? "").startsWith("image/") && (a.ContentLength ?? 0) < SIGNATURE_IMAGE_MAX))
    .slice(0, MAX_INBOUND_FILES);
}

const stripCid = (id: string) => id.replace(/^cid:/i, "").replace(/^<|>$/g, "");

/**
 * Le texte du message, sans les références brutes aux images collées : Brevo
 * rend `[image001.png@01DD…](image001.png@01DD…)` — illisible, et l'image est
 * maintenant affichée sous le message. Remplacé par « [image : image001.png] »
 * pour garder sa place dans la phrase (« il me manque : [image] »). Pure.
 */
export function cleanInlineImageRefs(text: string, list: unknown): string {
  const names = new Map<string, string>();
  for (const a of Array.isArray(list) ? (list as InboundAttachment[]) : []) {
    if (a?.ContentID) names.set(stripCid(a.ContentID).toLowerCase(), a.Name || stripCid(a.ContentID).split("@")[0]);
  }
  return text.replace(/!?\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, _label: string, target: string) => {
    const id = stripCid(target).toLowerCase();
    const name = names.get(id) ?? (/^cid:/i.test(target) || /^[\w.-]+\.(png|jpe?g|gif|webp)@[\w.]+$/i.test(target) ? id.split("@")[0] : null);
    return name ? `[image : ${name}]` : whole;
  });
}

/** Télécharge les pièces retenues chez Brevo et les range dans les médias. Ne lève jamais. */
export async function storeInboundAttachments(payload: Payload, list: unknown): Promise<number[]> {
  const picked = selectInboundAttachments(list);
  const key = process.env.BREVO_API_KEY;
  if (!picked.length) return [];
  if (!key) {
    payload.logger.error(`[e-mail entrant] ${picked.length} pièce(s) jointe(s) perdue(s) : BREVO_API_KEY absente.`);
    return [];
  }
  const ids = await Promise.all(
    picked.map(async (a, i) => {
      const name = a.Name?.trim() || `piece-jointe-${i + 1}`;
      try {
        const res = await fetch(`https://api.brevo.com/v3/inbound/attachments/${encodeURIComponent(a.DownloadToken!)}`, {
          headers: { "api-key": key },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        if (!data.length || data.length > MAX_INBOUND_SIZE) throw new Error(`taille ${data.length}`);
        const media = await payload.create({
          collection: "media",
          data: { alt: name },
          file: { data, mimetype: a.ContentType!, name, size: data.length },
          overrideAccess: true,
        });
        return media.id as number;
      } catch (err) {
        payload.logger.error(`[e-mail entrant] pièce jointe « ${name} » non récupérée : ${err}`);
        return null;
      }
    }),
  );
  return ids.filter((id): id is number => id != null);
}
