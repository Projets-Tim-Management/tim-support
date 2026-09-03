import type { PayloadRequest } from "payload";

/**
 * « C'est le logiciel qui note ce qu'il vient de faire. »
 *
 * `guardStructuralEdits` ne laisse un utilisateur non-admin modifier, sur une
 * ligne d'envoi, que sa date programmée et sa dérogation. `sentAt` en est exclu,
 * et doit le rester : un partenaire qui pourrait l'écrire ferait taire un
 * message sans qu'il soit jamais parti.
 *
 * Mais le code qui vient d'envoyer, lui, a le droit de le dire — or il s'exécute
 * sur la requête de cet utilisateur, avec son compte. D'où ce drapeau, porté par
 * `req.context` : il distingue le constat du logiciel de la saisie d'un humain.
 *
 * ⚠️ Il vit ici, et non dans la collection, parce que DEUX chemins marquent un
 * envoi : le hook du parcours et la fonction d'envoi partagée. Le second l'avait
 * oublié — un envoi déclenché par un partenaire perdait son marquage en
 * silence, et le garde-fou anti-doublon qui repose dessus avec lui.
 */
export const JOURNEY_SYSTEM_WRITE = "journeySystemWrite";

/**
 * Exécute une écriture SYSTÈME sur le parcours : pose le drapeau, le retire
 * quoi qu'il arrive.
 *
 * Le `finally` n'est pas décoratif : `req.context` survit à l'appel et sert
 * toute la requête. Un drapeau laissé en place ferait passer pour un constat du
 * logiciel la modification suivante, celle d'un humain.
 */
export async function withSystemWrite<T>(
  req: PayloadRequest | undefined,
  ecriture: () => Promise<T>,
): Promise<T> {
  if (!req) return ecriture();
  const ctx = (req.context ?? {}) as Record<string, unknown>;
  ctx[JOURNEY_SYSTEM_WRITE] = true;
  try {
    return await ecriture();
  } finally {
    delete ctx[JOURNEY_SYSTEM_WRITE];
  }
}
