/**
 * Modèle d'import d'une feature + prompt à coller dans Claude.
 *
 * Flux : on copie `buildCopyText()` → on le colle à Claude sur son poste →
 * Claude renvoie un JSON rempli → on recolle ce JSON dans l'admin (composant
 * FeatureImport) → l'endpoint `/payload-api/features/import` crée un brouillon.
 *
 * ⚠️ Fichier volontairement SANS dépendance serveur (importé côté client).
 * Les images ne sont pas gérées ici : à ajouter à la main après l'import.
 */

/** Squelette JSON attendu par l'endpoint (valeurs = exemples/placeholders). */
export const FEATURE_IMPORT_TEMPLATE = {
  title: "Nom interne de la feature (obligatoire)",
  titleFeature: "Titre affiché sur le site (laisser vide = identique au titre)",
  shortDescription: "Résumé en une phrase (listes, résultats de recherche)",
  keywords: ["synonyme 1", "synonyme 2"],
  availability: "disponible",
  intro: "Texte d'introduction en **markdown** (gras, listes, titres… acceptés).",
  parties: [
    {
      titre: "Titre de la première partie",
      description:
        "Description de la partie en **markdown**.\n\n- étape 1\n- étape 2",
      mediaPosition: "droite",
    },
  ],
} as const;

/** Consignes détaillées pour que Claude remplisse le modèle proprement. */
export const FEATURE_IMPORT_PROMPT = `Tu vas rédiger la documentation d'une fonctionnalité (feature) pour notre centre d'aide, puis me la rendre au format JSON strict décrit ci-dessous, que je collerai dans notre back-office.

Règles :
- Réponds UNIQUEMENT avec le bloc JSON (aucun texte avant/après, pas de commentaire).
- Respecte exactement les clés du modèle. Ne rajoute aucune clé.
- Champs texte riche ("intro" et chaque "description") : rédige-les en **Markdown** (gras, italique, listes à puces/numérotées, titres ##, liens). Utilise \\n pour les retours à la ligne.
- "availability" : uniquement l'une de ces valeurs → "disponible", "beta" ou "prochainement".
- "mediaPosition" (par partie) : "droite" ou "gauche" (position du visuel qui sera ajouté à la main plus tard). Mets "droite" si tu ne sais pas.
- "keywords" : liste de synonymes/termes de recherche (peut être vide []).
- Découpe la feature en "parties" logiques (une par étape/notion). N'insère PAS d'images : je les ajouterai manuellement.
- Laisse "titleFeature" vide ("") s'il est identique à "title".

Modèle à remplir :`;

/** Texte complet à copier dans le presse-papier (prompt + modèle JSON). */
export function buildCopyText(): string {
  return `${FEATURE_IMPORT_PROMPT}\n\n\`\`\`json\n${JSON.stringify(
    FEATURE_IMPORT_TEMPLATE,
    null,
    2,
  )}\n\`\`\``;
}
