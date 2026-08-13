import type { Payload } from "payload";

import { decryptSecret, encryptSecret } from "@/core/lib/secrets";

/**
 * Mots de passe des accès de test : chiffrés au repos, lus par exception.
 *
 * Ce sont de vrais accès au logiciel TIM. Les garder en clair signifiait qu'une
 * copie de la base — sauvegarde égarée, export de debug, accès en lecture chez
 * l'hébergeur — livrait les comptes de tous les clients en test.
 *
 * Ils restent lisibles à deux endroits, tous deux légitimes :
 *  - l'espace client, où le client vient chercher ce qu'il doit distribuer à ses
 *    équipes (il s'est déjà authentifié par code à usage unique) ;
 *  - le back-office, mais seulement après une confirmation par code envoyé à
 *    l'adresse du demandeur.
 *
 * La clé dérive de `PAYLOAD_SECRET`, comme les jetons d'agenda. Conséquence à
 * connaître : changer ce secret rend les mots de passe illisibles et il faut les
 * régénérer.
 */

/** Ce que voit quiconque lit la fiche sans être passé par la révélation. */
export const PASSWORD_MASK = "••••••";

/** Format produit par `encryptSecret` : trois segments base64url séparés par un point. */
const looksEncrypted = (v: string): boolean => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);

/**
 * Valeur STOCKÉE d'un mot de passe, lue en brut.
 *
 * Nécessairement via `payload.db` : `findByID` appliquerait le hook de masquage,
 * et on récupérerait `••••••` au lieu du chiffré.
 */
async function rawStoredPassword(
  payload: Payload,
  id: number | string,
): Promise<string | null> {
  try {
    const doc = (await payload.db.findOne({
      collection: "client-credentials",
      where: { id: { equals: id } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as { password?: string } | null;
    return doc?.password ?? null;
  } catch {
    return null;
  }
}

/**
 * Chiffre à l'écriture — sauf si la valeur est déjà chiffrée, ou si c'est le
 * masque.
 *
 * Le masque est LE piège de ce dispositif. Le formulaire affiche `••••••`, et un
 * enregistrement sans intervention renvoie cette chaîne : la chiffrer
 * remplacerait le mot de passe par des points, définitivement et en silence.
 *
 * On ne peut pas se rabattre sur `originalDoc` pour le rattraper : il a lui aussi
 * traversé le hook de masquage, et vaut donc `••••••`. Il faut relire la valeur
 * stockée en base — c'est le prix d'un hook asynchrone, payé une fois par
 * enregistrement d'accès, ce qui est rare.
 */
export const encryptPasswordValue = async (
  value: unknown,
  ctx?: { payload?: Payload; id?: number | string },
): Promise<string | null | undefined> => {
  if (value == null || value === "") return value as null | undefined;
  const v = String(value);

  if (v === PASSWORD_MASK) {
    if (!ctx?.payload || ctx.id == null) return undefined; // rien à restituer
    return (await rawStoredPassword(ctx.payload, ctx.id)) ?? undefined;
  }

  if (looksEncrypted(v) && decryptSecret(v) !== null) return v; // déjà chiffré
  return encryptSecret(v);
};

/** Déchiffre, en tolérant les valeurs écrites avant la mise en place du chiffrement. */
export const readPassword = (stored?: string | null): string | null => {
  if (!stored) return null;
  const clear = decryptSecret(stored);
  // Valeur antérieure au chiffrement : elle est en clair, on la rend telle
  // quelle plutôt que de faire croire à un accès perdu.
  return clear ?? stored;
};

export type PlainCredential = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  licenceProfile?: string | null;
  username?: string | null;
  password: string | null;
  deliveredAt?: string | null;
};

/**
 * Accès d'un client, mots de passe EN CLAIR.
 *
 * Lecture directe via `payload.db` : passer par l'API appliquerait le hook de
 * masquage, qui est précisément ce qu'on veut contourner ici — en connaissance
 * de cause, dans un chemin serveur contrôlé.
 *
 * Chaque appelant doit avoir vérifié SES droits avant d'appeler : cette fonction
 * ne fait aucun contrôle d'accès, et c'est volontaire — elle sert autant la
 * route du portail (session client) que celle du back-office (code confirmé).
 */
export async function readClientCredentials(
  payload: Payload,
  clientId: number | string,
): Promise<PlainCredential[]> {
  const res = await payload.db.find({
    collection: "client-credentials",
    where: { client: { equals: clientId } },
    limit: 200,
    sort: "lastName",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const docs = ((res as { docs?: unknown[] })?.docs ?? []) as Array<Record<string, unknown>>;
  return docs.map((d) => ({
    id: d.id as number | string,
    firstName: (d.firstName as string) ?? null,
    lastName: (d.lastName as string) ?? null,
    licenceProfile: (d.licenceProfile as string) ?? null,
    username: (d.username as string) ?? null,
    password: readPassword(d.password as string | null),
    deliveredAt: (d.deliveredAt as string) ?? null,
  }));
}
