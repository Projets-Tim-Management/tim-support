/**
 * La BASE V1 des vidéos, en mots (décidée avec Charlie rendu après rendu le
 * 15/10/2026) — ce que l'agent recopie dans le prompt Claude Design.
 *
 * Elle était vérifiée par le moteur vidéo maison ; depuis le 19/10/2026, les
 * pubs se font dans Claude Design : les mêmes règles y passent en consignes,
 * écrites pour un outil de design et non plus pour un moteur. Un changement de
 * règle reste une Base V2, pas une exception.
 */

export type BeatText = { role: string; titre: string; secondes: string; but: string; consignes: string[]; libre: string[] };

/** Les six temps d'une vidéo, dans l'ordre. La preuve est facultative. */
export const BASE_V1_BEATS: BeatText[] = [
  {
    role: "accroche",
    titre: "1. Accroche",
    secondes: "3,5 à 4,5 s",
    but: "Le problème du chantier, en deux coups : un moment (« Vendredi. », « Lundi. ») puis la tension (« Soir. », « Tout change. »), et une phrase qui nomme la douleur.",
    consignes: [
      "Fond sombre de la marque, avec un halo lumineux doux.",
      "Deux titres très courts qui arrivent avec impact, l'un sous l'autre, bien espacés ; le second porte le mot fort en rouge.",
      "Dessous, une seule phrase qui s'écrit comme tapée au clavier (police des textes, curseur), terminée au moins 1 s avant la fin du temps.",
      "La caméra s'approche doucement de la phrase tapée (×1,2 à ×1,3).",
    ],
    libre: ["les mots, toujours la douleur de l'angle", "la nuance du fond sombre", "une légère inclinaison de la phrase"],
  },
  {
    role: "retournement",
    titre: "2. Retournement",
    secondes: "2,8 à 3,6 s",
    but: "L'ancienne façon barrée, la nouvelle à sa place : on doit comprendre CE QUE FAIT le logiciel (« Le planning prévient l'équipe. »), pas un slogan.",
    consignes: [
      "Fond pâle de la marque, avec un halo.",
      "Un seul titre : l'ancienne façon (3 à 5 mots) se lit ~1 s, chaque mot est barré, puis la nouvelle arrive mot par mot.",
      "La nouvelle phrase nomme la fonctionnalité de l'angle, avec UN mot fort en rouge.",
      "Rien d'autre à l'écran.",
    ],
    libre: ["les deux phrases", "le mot fort", "le mouvement de caméra (panoramique, montée, descente)"],
  },
  {
    role: "geste",
    titre: "3. Le geste",
    secondes: "4 à 5,5 s",
    but: "Le logiciel en vrai : l'enregistrement d'écran de LA fonctionnalité de l'angle dans un téléphone, et la caméra qui va chercher chaque détail qui compte.",
    consignes: [
      "Le rush joint (enregistrement d'écran de l'application) dans un téléphone, sur fond sombre avec halo. Un angle pointage montre le pointage, un angle planning montre le planning.",
      "2 à 4 étiquettes blanches (noms, postes, équipes fictifs) qui sortent du téléphone l'une après l'autre, à au moins 0,4 s d'écart.",
      "La caméra zoome sur chaque étiquette à son apparition (×1,5 à ×1,8), puis revient au téléphone entier ; le fond se floute pendant le zoom.",
      "Pas de mot géant en contour derrière le téléphone.",
    ],
    libre: ["le passage du rush", "l'entrée du téléphone et son inclinaison", "le texte des étiquettes, dans le vocabulaire de la fonctionnalité", "un doigt qui tape le bouton"],
  },
  {
    role: "consequence",
    titre: "4. Conséquence",
    secondes: "2,3 à 3,2 s",
    but: "Le résultat du geste, visible : validé, envoyé, prévenu.",
    consignes: [
      "Fond pâle avec halo.",
      "Soit une grande confirmation au centre, soit 2 à 3 notifications en cascade qui se valident l'une après l'autre.",
      "La validation est VERTE, avec une onde ; jamais de confettis.",
      "Au plus une pastille de résultat (« Toute l'équipe prévenue », « Paie prête »).",
    ],
    libre: ["confirmation en grand ou notifications", "les textes, le résultat concret de la fonctionnalité"],
  },
  {
    role: "preuve",
    titre: "5. Preuve (facultative)",
    secondes: "2,8 à 3,6 s",
    but: "Un fait sourcé qui rassure, puis l'invitation.",
    consignes: [
      "Fond pâle avec halo.",
      "Un compteur qui défile jusqu'à un fait SOURCÉ du brief (sans écrire la source à l'écran).",
      "Puis un titre court d'invitation sous le compteur (« Rejoignez-les. »).",
    ],
    libre: ["le fait, parmi ceux du brief", "la phrase d'invitation"],
  },
  {
    role: "fin",
    titre: "6. Fin",
    secondes: "2,6 à 3 s",
    but: "Le logo, puis l'offre et le bouton.",
    consignes: ["Entrée en fondu ; le logo en grand qui s'approche.", "Puis la caméra descend vers l'offre et le bouton d'action."],
    libre: ["la phrase de l'offre (« Essai gratuit de 30 jours »)"],
  },
];

/** Les règles de design de Charlie, valables pour toute pub (vidéo ou visuel fixe). */
export const BASE_V1_RULES: string[] = [
  "Vidéo de 15 à 20 s : chaque texte doit avoir le temps d'être lu.",
  "Les fonds alternent : jamais deux plans de suite sur le même fond, au moins 4 fonds différents ; ni tout blanc, ni tout rouge ; chaque fond plein a son halo.",
  "Le rouge est une TOUCHE (le mot fort, un mot par titre ; le curseur ; le bouton), jamais un aplat. Le vert ne sert qu'à « validé ».",
  "Un léger arrondi partout : ni angle vif, ni forme en pilule, ni rond.",
  "Une carte blanche sur fond clair a un trait fin et une ombre douce.",
  "Toujours du mouvement de caméra ; des transitions modernes et variées (jamais la même deux fois de suite, ni barre qui balaie, ni éclair).",
  "Éléments pas trop gros mais lisibles ; textes explicites : dire ce que fait le logiciel.",
  "Montrer beaucoup de petites touches du logiciel, toujours de la fonctionnalité de la campagne. Données d'interface fictives mais crédibles (prénoms, postes, chantiers).",
  "Pas de confettis, pas de mot géant en contour.",
  "Aucun chiffre absent des faits sourcés et de l'offre, aucun témoignage inventé.",
];

/** Les règles et la structure, en texte prêt à coller. `video` : les six temps ; sinon, les règles seules (visuel fixe). Pure. */
export function baseV1Text(video: boolean): string {
  const rules = ["RÈGLES DE DESIGN (Base V1) :", ...BASE_V1_RULES.map((r) => `- ${r}`)];
  if (!video) return rules.join("\n");
  const beats = BASE_V1_BEATS.flatMap((b) => [
    `${b.titre} — ${b.secondes}`,
    `   But : ${b.but}`,
    ...b.consignes.map((c) => `   - ${c}`),
    `   Libre : ${b.libre.join(" ; ")}.`,
  ]);
  return [...rules, "", "STRUCTURE DE LA VIDÉO (six temps) :", ...beats].join("\n");
}
