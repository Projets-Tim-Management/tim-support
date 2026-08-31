/**
 * « L'espace client est ouvert, mais le client n'a jamais reçu son invitation. »
 *
 * C'est le pire état du parcours : tout a l'air fait côté TIM, et le client n'a
 * ni lien ni code. Il ne peut donc pas remplir son dossier de démarrage — et la
 * relance qui suivra lui reprochera un retard dont il ignore tout.
 *
 * La règle vit ici, hors du composant, pour une raison simple : elle décide
 * d'une ALERTE ROUGE sur une carte, et une alerte qui se déclenche à tort finit
 * ignorée le jour où elle a raison. Elle mérite d'être éprouvée autrement qu'à
 * l'œil, sur un tableau rempli de vrais clients.
 */

/**
 * Ce que l'écran sait des connexions à l'espace client.
 *
 * `known: false` n'est pas « personne ne s'est connecté » : c'est « on l'ignore ».
 * La distinction est tout l'intérêt du type — sans elle, une lecture en échec
 * renvoyait une liste vide, indiscernable d'un vrai « aucune connexion », et
 * l'alerte s'allumait sur chaque carte du tableau.
 */
export type PortalLogins =
  | { known: true; connected: ReadonlySet<string> }
  | { known: false };

type AccountDoc = {
  client?: number | string | { id?: number | string } | null;
  lastLoginAt?: string | null;
};

/**
 * Interprète la réponse de l'API des accès à l'espace client.
 *
 * On ne se déclare informé que si la lecture a RÉUSSI et que la liste est
 * COMPLÈTE. Une liste tronquée par la limite est aussi trompeuse qu'une lecture
 * en échec : les clients absents de la page passeraient pour jamais connectés.
 */
export const readPortalLogins = (
  ok: boolean,
  body: { docs?: unknown; totalDocs?: number } | null | undefined,
  limit: number,
): PortalLogins => {
  if (!ok || !body || !Array.isArray(body.docs)) return { known: false };
  if (typeof body.totalDocs === "number" && body.totalDocs > limit) return { known: false };
  if (body.docs.length > limit) return { known: false };

  const connected = new Set<string>();
  for (const doc of body.docs as AccountDoc[]) {
    if (!doc?.lastLoginAt) continue;
    const ref = doc.client;
    const id = ref && typeof ref === "object" ? ref.id : ref;
    if (id != null) connected.add(String(id));
  }
  return { known: true, connected };
};

/**
 * Faut-il alerter sur ce client ?
 *
 * Trois conditions, et chacune écarte un faux positif précis :
 *
 *  - l'accès doit être OUVERT. Tant que l'étape « compte espace client » n'est
 *    pas faite, l'invitation n'a pas à être partie : alerter serait du bruit ;
 *  - l'envoi ne doit porter AUCUNE trace. C'est le fait constaté ;
 *  - le client ne doit PAS s'être déjà connecté. Il a alors reçu son lien d'une
 *    façon ou d'une autre — au téléphone, par un renvoi manuel — et la trace
 *    manquante ne regarde plus que le journal.
 *
 * Et dans le doute, on se tait : sans connaissance fiable des connexions, aucune
 * alerte. Mieux vaut un signal manquant qu'un signal auquel on n'obéit plus.
 */
export const isInviteMissing = (args: {
  accessOpen: boolean;
  invitationSentAt?: string | null;
  clientId: number | string | null | undefined;
  logins: PortalLogins;
}): boolean => {
  const { accessOpen, invitationSentAt, clientId, logins } = args;
  if (!accessOpen || invitationSentAt || clientId == null) return false;
  if (!logins.known) return false;
  return !logins.connected.has(String(clientId));
};
