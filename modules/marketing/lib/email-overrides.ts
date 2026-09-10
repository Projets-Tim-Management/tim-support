import type { Payload, PayloadRequest } from "payload";

/**
 * Les textes du parcours, repris à la main dans le back-office.
 *
 * Les messages du parcours sont écrits en code : ils comptent (« vos 9 accès »),
 * ils datent (« avant le 8 septembre »), et ils changent de forme selon le cas.
 * Les passer entièrement en données perdrait tout ça.
 *
 * D'où une SURCHARGE plutôt qu'un remplacement : le modèle « Parcours marketing »
 * porte, pour chaque message, des champs facultatifs. Vide, c'est le texte du
 * code qui part — donc rien ne change tant que personne n'écrit, et vider un
 * champ ramène l'original. Il n'existe aucun état « à moitié migré ».
 *
 * Lue sur le MODÈLE et non sur la copie du parcours : corriger une coquille doit
 * valoir pour les envois à venir de TOUS les tests, y compris ceux déjà lancés.
 * La copie du parcours, elle, garde ce qui lui est propre — sa date, son public,
 * son `sentAt`.
 */

const EMPTY: Record<string, string> = {};

type JourneyDoc = { emailTexts?: unknown };

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") {
    const id = (ref as { id?: unknown }).id;
    return typeof id === "number" || typeof id === "string" ? id : null;
  }
  return typeof ref === "number" || typeof ref === "string" ? ref : null;
};

/**
 * Les blocs repris pour ce message, sur ce modèle de parcours. L'OBJET en fait
 * partie : c'est un bloc comme les autres, écrit dans le même onglet.
 *
 * Silencieux par construction : un modèle introuvable, une lecture qui échoue,
 * et on renvoie « rien de repris ». Le message part alors avec ses textes
 * d'origine — jamais amputé, jamais bloqué. Un e-mail qui n'arrive pas parce
 * qu'on n'a pas pu lire une surcharge facultative serait le pire des échanges.
 */
export async function readEmailTexts(
  payload: Payload,
  journeyRef: unknown,
  key: string,
  req?: PayloadRequest,
): Promise<Record<string, string>> {
  const journeyId = idOf(journeyRef);
  if (journeyId == null) return EMPTY;

  try {
    const journey = (await payload.findByID({
      collection: "marketing-journeys",
      id: journeyId,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })) as JourneyDoc | null;

    return normalizeTexts(journey?.emailTexts, key);
  } catch {
    return EMPTY;
  }
}

/**
 * Le tableau à plat du modèle, ramené aux blocs D'UN message : `{ bloc: texte }`.
 *
 * À plat plutôt qu'un groupe de champs par message : les blocs ne sont pas les
 * mêmes d'un message à l'autre, et une colonne par bloc de chaque message ferait
 * une table de cinquante colonnes dont quarante vides.
 *
 * Les valeurs vides sont ÉCARTÉES ici, une fois pour toutes : ainsi le reste du
 * code n'a qu'une règle à connaître — la clé est là, ou elle n'y est pas. C'est
 * ce qui fait qu'effacer un champ ramène le texte d'origine.
 */
export const normalizeTexts = (raw: unknown, key?: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw as Array<{ key?: unknown; slot?: unknown; value?: unknown }>) {
    if (key !== undefined && entry?.key !== key) continue;
    const slot = typeof entry?.slot === "string" ? entry.slot.trim() : "";
    const value = typeof entry?.value === "string" ? entry.value.trim() : "";
    if (slot && value) out[slot] = value;
  }
  return out;
};
