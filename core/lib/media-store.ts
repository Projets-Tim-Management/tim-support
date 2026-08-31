/**
 * Adressage des fichiers sur le stockage distant (Vercel Blob).
 *
 * Isolé, et surtout PUR : ces fonctions décident de l'URL que le serveur ira
 * chercher après un dépôt fait par le navigateur. Une erreur ici ne se voit pas
 * — elle produit une image en ligne mais introuvable, ou pire, une requête
 * sortante vers une adresse choisie par le client.
 */

/**
 * Identifiant du magasin, lu dans le jeton d'écriture.
 *
 * Même dérivation que le plugin officiel : le jeton a la forme
 * `vercel_blob_rw_<magasin>_<aléa>`. On ne la réinvente pas, on la reprend —
 * deux façons de calculer la même URL finiraient par diverger.
 */
export const storeIdDepuisJeton = (jeton?: string | null): string | null =>
  jeton?.match(/^vercel_blob_rw_([a-z\d]+)_[a-z\d]+$/i)?.[1]?.toLowerCase() ?? null;

/** Base publique du magasin, ou `null` si le stockage n'est pas configuré. */
export const baseDuMagasin = (jeton?: string | null): string | null => {
  const surcharge = process.env.STORAGE_VERCEL_BLOB_BASE_URL;
  if (surcharge) return surcharge.replace(/\/$/, "");
  const id = storeIdDepuisJeton(jeton);
  return id ? `https://${id}.public.blob.vercel-storage.com` : null;
};

/**
 * URL d'un fichier déposé, construite À PARTIR DU NOM SEUL.
 *
 * ⚠️ Jamais à partir d'une URL fournie par le navigateur. Le serveur va
 * RÉELLEMENT chercher cette adresse pour relire le fichier : accepter celle du
 * client reviendrait à lui faire émettre la requête de son choix, y compris
 * vers le réseau interne. Le nom, lui, ne peut désigner qu'un objet du magasin.
 */
export const urlDuFichier = (jeton: string | null | undefined, filename: string): string | null => {
  const base = baseDuMagasin(jeton);
  if (!base || !filename) return null;
  // Le nom est déjà assaini (aucun chemin) ; on encode ce qui doit l'être.
  return `${base}/${encodeURIComponent(filename)}`;
};

// ─── Images ──────────────────────────────────────────────────────────────────

/**
 * Types que Payload traite comme ANIMÉS, et qu'il ré-encode image par image.
 *
 * Repris de sa propre liste : c'est ce choix qui décide s'il ouvre le fichier
 * avec `{ animated: true }`, donc s'il décode 160 vignettes ou une seule. Une
 * divergence ici ferait sonder autre chose que ce qui échoue réellement.
 */
// Recopiée telle quelle depuis generateFileData : ni plus, ni moins.
export const TYPES_ANIMES = ["image/avif", "image/gif", "image/webp"];

export const estTypeAnime = (mimeType?: string | null): boolean =>
  TYPES_ANIMES.includes((mimeType ?? "").toLowerCase());
