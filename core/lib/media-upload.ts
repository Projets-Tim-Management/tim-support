import { sanitizeFilename } from "payload/shared";

/**
 * Envoi d'un média depuis le navigateur : les règles ET le transport.
 *
 * Isolées du composant pour une raison précise : ce sont elles qui décident de
 * ce que l'utilisateur LIT quand un envoi échoue. Jusqu'ici il ne lisait rien —
 * la zone de dépôt restait vide, l'erreur partait dans la console, et le seul
 * moyen de comprendre était d'ouvrir les outils de développement.
 */

/**
 * Plafond d'un fichier, en octets.
 *
 * Ce n'est PLUS la limite de 4,5 Mo des fonctions Vercel : depuis l'envoi
 * direct au CDN, le fichier ne traverse plus la fonction à l'aller. Il reste
 * une borne, parce que le serveur relit ensuite le fichier pour en tirer ses
 * dimensions — un fichier sans limite finirait par épuiser sa mémoire, et
 * échouerait alors sans message clair, ce qu'on cherche justement à éviter.
 *
 * 100 Mo couvre largement les GIF de démonstration existants (le plus lourd en
 * base pèse 97 Mo).
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Taille lisible, à la française : « 4,7 Mo ». */
export const formatOctets = (octets: number): string => {
  if (!Number.isFinite(octets) || octets < 0) return "taille inconnue";
  if (octets < 1024) return `${Math.round(octets)} o`;
  const unites = ["Ko", "Mo", "Go"];
  let valeur = octets / 1024;
  let i = 0;
  while (valeur >= 1024 && i < unites.length - 1) {
    valeur /= 1024;
    i += 1;
  }
  // Une décimale sous 100, aucune au-delà : « 4,7 Mo » se lit, « 4,73 Mo » non.
  const arrondi = valeur < 100 ? Math.round(valeur * 10) / 10 : Math.round(valeur);
  return `${String(arrondi).replace(".", ",")} ${unites[i]}`;
};

/**
 * Le fichier est-il refusé AVANT d'être envoyé ?
 *
 * Refuser tôt vaut mieux que laisser partir vingt méga-octets pour les voir
 * rejetés à l'arrivée : l'attente est perdue, et le message d'échec arrive au
 * moment où l'on croyait avoir fini.
 */
export const refusPourTaille = (
  octets: number,
  max: number = MAX_UPLOAD_BYTES,
): string | null =>
  octets > max
    ? `Fichier trop lourd : ${formatOctets(octets)}, pour un maximum de ${formatOctets(max)}.`
    : null;

/** Message porté par une réponse d'erreur de l'API Payload, s'il y en a un. */
const messagePayload = (corps: unknown): string | null => {
  if (!corps || typeof corps !== "object") return null;
  const erreurs = (corps as { errors?: unknown }).errors;
  if (!Array.isArray(erreurs)) return null;
  const messages = erreurs
    .map((e) => (e && typeof e === "object" ? (e as { message?: unknown }).message : null))
    .filter((m): m is string => typeof m === "string" && m.trim().length > 0);
  return messages.length ? messages.join(" · ") : null;
};

/**
 * Ce qu'on affiche quand l'envoi échoue.
 *
 * Le message de Payload prime quand il existe — il est plus précis que tout ce
 * qu'on pourrait deviner. À défaut, une phrase par situation : « 400 » ne dit
 * rien à personne, et surtout pas ce qu'il faut faire ensuite.
 *
 * ⚠️ Le 400 des uploads est TROMPEUR. Payload le renvoie sous le libellé
 * générique « Problem uploading file » dès que quoi que ce soit échoue dans son
 * traitement d'image — lecture des métadonnées, redimensionnement, écriture sur
 * le stockage. La cause réelle n'est que dans les journaux du serveur ; on le
 * dit, plutôt que de laisser chercher.
 */
export const messageErreurUpload = (status: number, corps?: unknown): string => {
  const precis = messagePayload(corps);
  if (precis) return precis;

  if (status === 0) return "Envoi interrompu : connexion perdue.";
  if (status === 401 || status === 403) {
    return "Envoi refusé : votre session n'autorise pas l'ajout de médias. Reconnectez-vous.";
  }
  if (status === 413) {
    return `Fichier refusé par le serveur : il dépasse ${formatOctets(MAX_UPLOAD_BYTES)}.`;
  }
  if (status === 400) {
    return (
      "Le serveur n'a pas pu traiter ce fichier. C'est souvent une image que la " +
      "bibliothèque de traitement n'arrive pas à lire (GIF très lourd, fichier " +
      "corrompu, format inhabituel). Le détail se trouve dans les journaux du serveur."
    );
  }
  if (status >= 500) return "Le serveur a rencontré une erreur. Réessayez dans un instant.";
  return `Envoi échoué (erreur ${status}).`;
};

// ─── Transport ───────────────────────────────────────────────────────────────

/** Un média, réduit à ce dont l'écran a besoin. */
export interface MediaLite {
  id: string | number;
  url?: string;
  filename?: string;
  mimeType?: string;
}

export type Envoi = { ok: true; doc: MediaLite } | { ok: false; message: string };

/** Droit de dépôt sur le CDN, délivré par le serveur (avec l'écrasement). */
const ROUTE_JETON = "/api/media/jeton";
/** Enregistrement du média, une fois le fichier réellement déposé. */
const ROUTE_ENREGISTREMENT = "/api/media/enregistrer";
/** Envoi classique, quand il n'y a pas de stockage distant (dev local). */
const ROUTE_PAYLOAD = "/payload-api/media";

/** Réponse de l'API en document, ou message d'erreur exploitable. */
async function litReponse(res: Response): Promise<Envoi> {
  const corps = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, message: messageErreurUpload(res.status, corps) };
  const doc = (corps as { doc?: MediaLite } | null)?.doc;
  return doc
    ? { ok: true, doc }
    : { ok: false, message: "Le serveur a répondu sans le média attendu." };
}

/**
 * Enregistre le média d'un fichier DÉJÀ déposé sur le CDN.
 *
 * Le serveur reconstruit l'adresse à partir du seul nom — on ne lui transmet
 * donc pas d'URL, qu'il irait chercher les yeux fermés.
 */
async function enregistre(file: File, filename: string): Promise<Envoi> {
  return litReponse(
    await fetch(ROUTE_ENREGISTREMENT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, mimeType: file.type, size: file.size }),
    }),
  );
}

/**
 * Envoi d'un fichier, par le chemin le plus court disponible.
 *
 * 1. DIRECT AU CDN. Le fichier ne traverse pas la fonction serverless — c'est
 *    ce qui supprime le plafond de 4,5 Mo qu'elle impose au corps d'une
 *    requête, et qui faisait échouer les GIF de démonstration sur un « 400 »
 *    sans explication. Le serveur enchaîne ensuite sur l'enregistrement.
 * 2. PAR LE SERVEUR sinon : environnement sans stockage distant configuré, où
 *    les fichiers restent sur le disque local et sont petits de toute façon.
 *
 * Le nom est assaini AVANT le dépôt, avec la même fonction que le serveur : la
 * clé écrite sur le CDN et le nom enregistré en base doivent désigner le même
 * fichier, sinon l'image est en ligne et introuvable.
 */
export async function uploadFile(file: File): Promise<Envoi> {
  const refus = refusPourTaille(file.size);
  if (refus) return { ok: false, message: refus };

  let filename: string;
  try {
    filename = sanitizeFilename(file.name);
  } catch {
    return { ok: false, message: "Ce nom de fichier n'est pas exploitable." };
  }

  try {
    const { upload } = await import("@vercel/blob/client");
    await upload(filename, file, {
      access: "public",
      contentType: file.type,
      handleUploadUrl: ROUTE_JETON,
    });
    return await enregistre(file, filename);
  } catch (err) {
    // Pas de stockage distant configuré → on repasse par le serveur, qui
    // écrira sur le disque local. Une panne du dépôt direct atterrit ici aussi :
    // mieux vaut un second essai qu'un échec sur une route absente.
    console.warn("[media] dépôt direct indisponible, envoi par le serveur :", err);
  }

  const fd = new FormData();
  fd.append("file", file);
  return litReponse(
    await fetch(ROUTE_PAYLOAD, { method: "POST", body: fd, credentials: "include" }),
  );
}
