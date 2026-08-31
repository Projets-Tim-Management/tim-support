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
  intro:
    "Phrase d'accroche qui situe la fonctionnalité.\n\n" +
    "→ Un premier point, introduit par une **flèche**.\n\n" +
    "→ Un second point, séparé du précédent par une ligne vide.",
  parties: [
    {
      titre: "Titre de la première partie",
      description:
        "Une phrase qui présente ce que fait ce bloc.\n\n" +
        "→ **Un libellé** : ce qu'il désigne, avec un exemple chiffré si utile.\n\n" +
        "→ **Un autre libellé** : son explication.\n\n" +
        "*Idéal pour … — la valeur concrète pour la personne qui lit.*",
      mediaPosition: "droite",
    },
  ],
} as const;

/** Consignes détaillées pour que Claude remplisse le modèle proprement. */
export const FEATURE_IMPORT_PROMPT = `Tu vas rédiger la documentation d'une fonctionnalité (feature) pour notre centre d'aide, puis me la rendre au format JSON strict décrit ci-dessous, que je collerai dans notre back-office.

Règles :
- Réponds UNIQUEMENT avec le bloc JSON (aucun texte avant/après, pas de commentaire).
- Respecte exactement les clés du modèle. Ne rajoute aucune clé.
- Champs texte riche ("intro" et chaque "description") : rédige-les en **Markdown** (gras, italique, titres ##, liens). Utilise \\n pour les retours à la ligne.
- ⚠️ AUCUNE LISTE À PUCES ni numérotée. N'utilise ni "-", ni "*", ni "1." en début de ligne.
  Chaque point commence par une FLÈCHE "→" et forme son PROPRE PARAGRAPHE, séparé du
  suivant par une ligne vide (\\n\\n). Les points s'affichent ainsi les uns sous les
  autres, sans retrait ni pastille :

      Une phrase d'introduction.\\n\\n→ **Libellé** : explication.\\n\\n→ **Autre libellé** : explication.

- Mets en **gras** le terme que le point définit, suivi de " : " puis de l'explication.
- Termine chaque "description" par une ligne en italique commençant par "*Idéal pour"
  qui dit à quoi ça sert concrètement.
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
