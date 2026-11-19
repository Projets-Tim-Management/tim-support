/**
 * Données enregistrées pour les tests des fiches métier.
 * - WordPress : fiche « magasinier-negoce-materiaux-construction » relue le 18/11/2026
 *   (GET /wp/v2/metiers?context=edit, lecture seule) ; certifications et FAQ de « couvreur »
 *   (forme d'avant le 01/10/2026, celle que lit le front) ; intitulés et slugs des 44 fiches.
 * - France Travail : réponses aux formes lues par francetravail.py (aucun appel réel).
 */

export const WP_MAGASINIER = {
  "title": "Magasinier / Magasinière en négoce des matériaux de construction",
  "slug": "magasinier-negoce-materiaux-construction",
  "acf": {
    "rome": "F1710",
    "definition": "Le magasinier en négoce des matériaux de construction réceptionne, stocke, prépare et distribue les matériaux du BTP (parpaings, ciment, placo, carrelage, bois) dans une agence de négoce. Il contrôle les livraisons, gère les stocks sur informatique et conseille les clients professionnels au comptoir ou en cour des matériaux.",
    "synonymes": [
      {
        "valeur": "Magasinier négoce BTP"
      },
      {
        "valeur": "Préparateur de commandes matériaux"
      },
      {
        "valeur": "Gestionnaire de stock matériaux"
      },
      {
        "valeur": "Magasinier-cariste négoce"
      }
    ],
    "points_cles": [
      {
        "valeur": "Salaire médian de 2 189 € brut par mois, tous âges confondus"
      },
      {
        "valeur": "Environ 640 offres d'emploi publiées sur les 12 derniers mois"
      },
      {
        "valeur": "Tension de recrutement modérée avec seulement 80 demandeurs d'emploi inscrits"
      },
      {
        "valeur": "Fourchette de rémunération située entre 1 900 € et 2 290 € brut mensuels"
      },
      {
        "valeur": "Le salaire progresse de 2 141 € avant 35 ans à 2 254 € après 35 ans"
      }
    ],
    "derniere_mise_a_jour": "2026-11-17",
    "informations_cles": {
      "titre": "Magasinier / Magasinière en négoce des matériaux de construction",
      "categorie": "Travaux publics & VRD",
      "description": "Le magasinier en négoce des matériaux travaille dans les agences de distribution destinées aux artisans et entreprises du bâtiment. Il assure la réception, le rangement et la préparation des commandes de matériaux lourds et volumineux. Polyvalent, il manipule souvent un chariot élévateur, saisit les mouvements de stock sur ordinateur et accueille la clientèle professionnelle.",
      "items": [
        {
          "label": "Salaire médian",
          "value": "2 189 €",
          "unit": "brut / mois"
        },
        {
          "label": "Offres / an",
          "value": "640",
          "unit": ""
        },
        {
          "label": "Tension de recrutement",
          "value": "Modérée",
          "unit": ""
        },
        {
          "label": "Demandeurs d'emploi",
          "value": "80",
          "unit": ""
        }
      ]
    },
    "certifications": {
      "valeur": "",
      "source": ""
    },
    "statistiques": {
      "titre": "Statistiques sur ce métier",
      "texte": "Les données du marché de l'emploi reflètent une demande régulière dans la filière du négoce de matériaux.",
      "source": {
        "label": "France Travail — dataemploi (12 derniers mois)",
        "url": "https://dataemploi.francetravail.fr/emploi/metier/chiffres-cles/NAT/FR/F1710",
        "date": "2026-11-17"
      },
      "items": [
        {
          "valeur": "640",
          "label": "Offres diffusées sur 12 mois"
        },
        {
          "valeur": "80",
          "label": "Demandeurs d'emploi inscrits"
        }
      ]
    },
    "salaires": {
      "titre": "Salaires",
      "texte": "Les rémunérations varient selon l'expérience, les certifications CACES détenues et la taille de l'agence de négoce.",
      "source": {
        "label": "France Travail (médianes en poste + fourchette des offres, 12 mois)",
        "url": "https://dataemploi.francetravail.fr/emploi/metier/chiffres-cles/NAT/FR/F1710",
        "date": "2026-11-17"
      },
      "fourchette_offres": {
        "min": "1900",
        "max": "2290",
        "part": "80"
      },
      "medians": [
        {
          "label": "Tous âges",
          "valeur": "2189"
        },
        {
          "label": "Moins de 35 ans",
          "valeur": "2141"
        },
        {
          "label": "35 ans et plus",
          "valeur": "2254"
        }
      ]
    },
    "competences": {
      "titre": "Compétences",
      "texte": "Le métier combine rigueur logistique, maîtrise des engins de manutention et sens du service client professionnel.",
      "groupes": [
        {
          "titre": "Savoir-faire",
          "items": [
            {
              "valeur": "Réceptionner et contrôler les livraisons de matériaux"
            },
            {
              "valeur": "Conduire un chariot élévateur avec CACES R489"
            },
            {
              "valeur": "Préparer les commandes et gérer les stocks sur logiciel"
            },
            {
              "valeur": "Ranger et sécuriser les matériaux en cour et en entrepôt"
            }
          ]
        },
        {
          "titre": "Savoir-être",
          "items": [
            {
              "valeur": "Rigueur et organisation"
            },
            {
              "valeur": "Sens du service et contact client"
            },
            {
              "valeur": "Résistance physique et vigilance"
            },
            {
              "valeur": "Esprit d'équipe et réactivité"
            }
          ]
        }
      ]
    },
    "contextes": {
      "titre": "Contextes de travail",
      "texte": "Le magasinier en négoce exerce dans des environnements variés, entre entrepôt couvert, cour extérieure et comptoir de vente.",
      "items": [
        {
          "label": "Port de charges lourdes",
          "description": "La manipulation de sacs de ciment, parpaings et plaques de plâtre sollicite physiquement le dos et les bras."
        },
        {
          "label": "Travail en extérieur",
          "description": "La cour des matériaux expose aux intempéries, au froid comme à la chaleur, tout au long de l'année."
        },
        {
          "label": "Conduite d'engins",
          "description": "L'utilisation quotidienne du chariot élévateur impose vigilance et respect strict des règles de sécurité."
        },
        {
          "label": "Horaires d'agence",
          "description": "Les horaires suivent l'ouverture de l'agence, avec des pics d'activité tôt le matin lors des enlèvements."
        },
        {
          "label": "Relation client",
          "description": "Le contact avec les artisans et entreprises du BTP au comptoir fait partie intégrante du poste."
        }
      ]
    },
    "orientation": {
      "titre": "Ce métier est-il fait pour vous ?",
      "intro": "Cinq questions rapides pour estimer la compatibilité avec le métier de magasinier en négoce des matériaux.",
      "questions": [
        {
          "question": "Êtes-vous à l'aise avec le port de charges et l'effort physique ?",
          "options": [
            {
              "label": "Oui, je suis endurant et robuste",
              "points": "3"
            },
            {
              "label": "Plutôt, dans des limites raisonnables",
              "points": "2"
            },
            {
              "label": "Peu, je me fatigue vite",
              "points": "1"
            },
            {
              "label": "Non, je l'évite",
              "points": "0"
            }
          ]
        },
        {
          "question": "Accepteriez-vous de conduire un chariot élévateur au quotidien ?",
          "options": [
            {
              "label": "Oui, j'ai ou je veux le CACES",
              "points": "3"
            },
            {
              "label": "Oui, après formation",
              "points": "2"
            },
            {
              "label": "Pourquoi pas, sans certitude",
              "points": "1"
            },
            {
              "label": "Non, cela ne m'intéresse pas",
              "points": "0"
            }
          ]
        },
        {
          "question": "Êtes-vous rigoureux dans la gestion et le comptage des stocks ?",
          "options": [
            {
              "label": "Oui, l'organisation est ma force",
              "points": "3"
            },
            {
              "label": "Plutôt méthodique",
              "points": "2"
            },
            {
              "label": "Variable selon les tâches",
              "points": "1"
            },
            {
              "label": "Non, j'oublie facilement",
              "points": "0"
            }
          ]
        },
        {
          "question": "Aimez-vous le contact avec une clientèle professionnelle ?",
          "options": [
            {
              "label": "Oui, j'aime conseiller et échanger",
              "points": "3"
            },
            {
              "label": "Oui, ponctuellement",
              "points": "2"
            },
            {
              "label": "Je préfère travailler seul",
              "points": "1"
            },
            {
              "label": "Non, le contact me gêne",
              "points": "0"
            }
          ]
        },
        {
          "question": "Le travail en extérieur et par tous les temps vous convient-il ?",
          "options": [
            {
              "label": "Oui, sans problème",
              "points": "3"
            },
            {
              "label": "Oui, avec un équipement adapté",
              "points": "2"
            },
            {
              "label": "Peu, je préfère l'intérieur",
              "points": "1"
            },
            {
              "label": "Non, pas du tout",
              "points": "0"
            }
          ]
        }
      ],
      "resultats": [
        {
          "min": "12",
          "titre": "Ce métier est fait pour vous !",
          "texte": "Votre profil correspond parfaitement au métier de magasinier en négoce des matériaux : endurance, rigueur et sens du service sont réunis. Envisagez un CAP logistique ou un CACES pour vous lancer rapidement dans ce secteur qui recrute."
        },
        {
          "min": "7",
          "titre": "Le métier peut vous correspondre",
          "texte": "Vous présentez plusieurs atouts pour ce métier du négoce BTP. Quelques points restent à confirmer, notamment la conduite d'engins ou le travail physique. Une immersion ou une formation ciblée vous aiderait à valider votre choix."
        },
        {
          "min": "0",
          "titre": "Ce métier ne semble pas idéal",
          "texte": "Ce métier exige de l'endurance physique, de la rigueur logistique et un bon contact client. Si ces aspects vous rebutent, d'autres métiers du BTP ou de la logistique pourraient mieux vous convenir. Explorez des pistes proches comme la vente ou la gestion."
        }
      ],
      "cta": {
        "texte": "Vous encadrez déjà des équipes ?",
        "label": "Découvrir TIM",
        "url": "/contact-visio"
      }
    },
    "faq": [
      {
        "q": "",
        "r": ""
      }
    ]
  },
  "seo_meta": {
    "title": "Magasinier négoce matériaux : métier, salaire, formation",
    "metadesc": "Magasinier en négoce des matériaux : salaire médian 2 189 €, formation CAP/CACES, conditions et débouchés. Un métier BTP qui recrute, tension modérée.",
    "focuskw": "Magasinier / Magasinière en négoce des matériaux de construction"
  }
};

export const WP_COUVREUR_CERTIFICATIONS = {
  "titre": "Certifications et diplômes",
  "texte": "Plusieurs diplômes du BTP mènent au métier de couvreur, du CAP au brevet professionnel.",
  "items": [
    {
      "intitule": "CAP Couvreur",
      "niveau": "Niveau 3 (CAP)",
      "duree": "2 ans"
    },
    {
      "intitule": "CAP Étanchéité du bâtiment et des travaux publics",
      "niveau": "Niveau 3 (CAP)",
      "duree": "2 ans"
    },
    {
      "intitule": "Bac professionnel Interventions sur le patrimoine bâti, option couverture",
      "niveau": "Niveau 4 (Bac)",
      "duree": "3 ans"
    },
    {
      "intitule": "Brevet professionnel Couvreur",
      "niveau": "Niveau 4 (BP)",
      "duree": "2 ans"
    },
    {
      "intitule": "Mention complémentaire Zinguerie",
      "niveau": "Niveau 3 (MC)",
      "duree": "1 an"
    }
  ]
};

export const WP_COUVREUR_FAQ = {
  "titre": "Questions fréquentes",
  "items": [
    {
      "question": "Quel diplôme pour devenir Couvreur / Couvreuse ?",
      "reponse": "Pour devenir couvreur, le CAP Couvreur est la voie principale, accessible après la troisième et préparé en deux ans. On peut poursuivre avec un brevet professionnel Couvreur, un bac professionnel Interventions sur le patrimoine bâti ou une mention complémentaire Zinguerie pour se spécialiser davantage."
    },
    {
      "question": "Quel est le salaire d'un couvreur ?",
      "reponse": "Un couvreur perçoit un salaire médian d'environ 2 421 € brut par mois. Les moins de 35 ans gagnent autour de 2 271 €, contre 2 556 € pour les plus expérimentés. Les offres d'emploi proposent généralement une rémunération comprise entre 1 930 € et 2 600 € brut mensuel."
    },
    {
      "question": "Le métier de couvreur recrute-t-il ?",
      "reponse": "Oui, le métier de couvreur connaît une tension de recrutement très élevée dans le BTP. Près de 22 970 offres ont été publiées sur douze mois, pour environ 10 080 demandeurs d'emploi inscrits. Les perspectives d'embauche et d'évolution sont donc particulièrement favorables dans ce secteur."
    },
    {
      "question": "Quelles sont les conditions de travail d'un couvreur ?",
      "reponse": "Le couvreur travaille en hauteur sur les toitures, exposé aux intempéries et au soleil. Le métier est physique, avec port de charges et postures contraignantes. Le respect des consignes de sécurité, l'usage du harnais antichute et le travail en équipe sont essentiels sur les chantiers."
    },
    {
      "question": "Quelle différence entre couvreur et zingueur ?",
      "reponse": "Le couvreur pose et entretient les matériaux de toiture comme les tuiles et ardoises, tandis que le zingueur travaille les éléments métalliques en zinc, notamment gouttières et chéneaux. De nombreux professionnels cumulent les deux compétences sous l'appellation couvreur-zingueur, très recherchée dans le bâtiment."
    },
    {
      "question": "Quelles qualités faut-il pour être couvreur ?",
      "reponse": "Un couvreur doit avoir une bonne condition physique, aucune sensation de vertige et un fort sens de la sécurité. La rigueur, la précision manuelle et l'esprit d'équipe sont indispensables. La capacité à travailler en extérieur par tous les temps complète le profil idéal du couvreur."
    }
  ]
};

export const WP_TITLES_SLUGS: Array<[string, string]> = [["Magasinier / Magasinière en négoce des matériaux de construction", "magasinier-negoce-materiaux-construction"], ["Poseur / Poseuse de canalisations", "poseur-canalisations"], ["Ouvrier / Ouvrière en voiries", "ouvrier-voiries"], ["Technicien / Technicienne de désenfumage", "technicien-desenfumage"], ["Electricien / Electricienne ferroviaire", "electricien-ferroviaire"], ["Installateur / Installatrice de bornes de recharges électriques", "installateur-bornes-recharges-electriques"], ["Poseur / Poseuse de compteurs", "poseur-compteurs"], ["Monteur / Monteuse installation réseaux mobiles", "monteur-installation-reseaux-mobiles"], ["Monteur / Monteuse en éclairage public", "monteur-eclairage-public"], ["Monteur / Monteuse de réseaux électriques", "monteur-reseaux-electriques"], ["Electricien / Electricienne du bâtiment", "electricien-batiment"], ["Calorifugeur / Calorifugeuse", "calorifugeur"], ["Ramoneur / Ramoneuse", "ramoneur"], ["Installateur / Installatrice chauffage et climatisation", "installateur-chauffage-climatisation"], ["Installateur mainteneur / Installatrice mainteneuse en systèmes solaires, thermiques et photovoltaïques", "installateur-mainteneur-mainteneuse-systemes-solaires-thermiques-photovoltaiques"], ["Plombier / Plombière sanitaire", "plombier-sanitaire"], ["Solier / Solière", "solier"], ["Carreleur / Carreleuse", "carreleur"], ["Staffeur Stuqueur / Staffeuse Stuqueuse", "staffeur-stuqueur-stuqueuse"], ["Peintre en bâtiment", "peintre-batiment"], ["Plaquiste", "plaquiste"], ["Plâtrier / Plâtrière", "platrier"], ["Monteur / Monteuse en agencement", "monteur-agencement"], ["Poseur / Poseuse de façade vitrée", "poseur-facade-vitree"], ["Poseur / Poseuse de véranda", "poseur-veranda"], ["Poseur / Poseuse de menuiseries extérieures", "poseur-menuiseries-exterieures"], ["Poseur / Poseuse de cloisons démontables et mobiles", "poseur-cloisons-demontables-mobiles"], ["Poseur / Poseuse en fermetures de bâtiment", "poseur-fermetures-batiment"], ["Menuisier / Menuisière aluminium", "menuisier-aluminium"], ["Couvreur / Couvreuse", "couvreur"], ["Etancheur / Etancheuse", "etancheur"], ["Tailleur / Tailleuse de pierre", "tailleur-pierre"], ["Façadier / Façadière itéiste", "facadier-iteiste"], ["Echafaudeur / Echafaudeuse", "echafaudeur"], ["Monteur / Monteuse en structures métalliques", "monteur-structures-metalliques"], ["Monteur / Monteuse de structures bois", "monteur-structures-bois"], ["Démolisseur / Démolisseuse", "demolisseur"], ["Installateur-poseur / Installatrice-poseuse de piscines préfabriquées", "installateur-poseur-piscines-prefabriquees"], ["Maçon / Maçonne du paysage", "macon-paysage"], ["Armaturier / Armaturière de l'industrie du béton", "armaturier-industrie-beton"], ["Manouvre bâtiment", "manouvre-batiment"], ["Maçon / Maçonne", "macon"], ["Coffreur / Coffreuse", "coffreur"], ["Charpentier", "charpentier"]];

// ── France Travail (formes lues par francetravail.py) ────────────────────────

export const FT_TOKEN = { access_token: "jeton-test", scope: "api_stats-offres-demandes-emploiv1 offresetdemandesemploi", token_type: "Bearer", expires_in: 1499 };

/** GET /v1/indicateur/salaire-rome-fap/NAT/FR?codeRome=F1710 : une ligne par FAP rattachée au ROME. */
export const FT_SALAIRES = {
  codeTypeTerritoire: "NAT",
  codeTerritoire: "FR",
  valeursParPeriode: [
    {
      codeActivite: "J1Z80",
      libActivite: "Ouvriers qualifiés de la manutention",
      codePeriode: "2025",
      salaireValeurMontant: [
        { codeNomenclature: "SAL1", libNomenclature: "Salaire débutant", valeurPrincipaleMontant: 1990.2 },
        { codeNomenclature: "SAL2", libNomenclature: "Salaire expérimenté", valeurPrincipaleMontant: 2120.7 },
        { codeNomenclature: "SAL3", libNomenclature: "Salaire médian", valeurPrincipaleMontant: 2050.0 },
      ],
    },
    {
      codeActivite: "J1Z40",
      libActivite: "Magasiniers qualifiés",
      codePeriode: "2025",
      salaireValeurMontant: [
        { codeNomenclature: "SAL1", libNomenclature: "Salaire débutant", valeurPrincipaleMontant: 2141.4 },
        { codeNomenclature: "SAL2", libNomenclature: "Salaire expérimenté", valeurPrincipaleMontant: 2254.3 },
        { codeNomenclature: "SAL3", libNomenclature: "Salaire médian", valeurPrincipaleMontant: 2189.4 },
      ],
    },
  ],
};

/** POST /v1/indicateur/stat-offres (TRIMESTRE, ORIGINEOFF). */
export const FT_STAT_OFFRES = {
  codeTypeTerritoire: "NAT",
  codeTerritoire: "FR",
  codeTypeActivite: "ROME",
  codeActivite: "F1710",
  codeTypePeriode: "TRIMESTRE",
  codeTypeNomenclature: "ORIGINEOFF",
  listeValeursParPeriode: [
    { codeNomenclature: "TOFF", libNomenclature: "Toutes offres", codePeriode: "2026T3", libPeriode: "3e trimestre 2026", datMaj: "2026-10-15T00:00:00", valeurPrincipaleNombre: 170 },
    { codeNomenclature: "TOFF-CUMUL12MOIS", libNomenclature: "Toutes offres sur 12 mois", codePeriode: "2026T3", libPeriode: "3e trimestre 2026", datMaj: "2026-10-16", valeurPrincipaleNombre: 640 },
  ],
};

/** POST /v1/indicateur/stat-demandeurs-entrant (TRIMESTRE, CATCAND). */
export const FT_STAT_DEMANDEURS = {
  codeTypeNomenclature: "CATCAND",
  listeValeursParPeriode: [
    { codeNomenclature: "CATABC", codePeriode: "2026T3", valeurPrincipaleNombre: 25 },
    { codeNomenclature: "CUMUL 12 MOIS", codePeriode: "2026T3", valeurPrincipaleNombre: 80 },
  ],
};

/** POST /v1/indicateur/stat-perspective-employeur (ANNEE, TYPE_TENSION) : niveau 1 à 5. */
export const FT_STAT_TENSION = {
  codeTypeNomenclature: "TYPE_TENSION",
  listeValeursParPeriode: [
    { codeNomenclature: "INTENSITE", codePeriode: "2025", valeurPrincipaleNombre: 4 },
    { codeNomenclature: "PERSPECTIVE", codePeriode: "2025", valeurPrincipaleNombre: 3 },
  ],
};

/** GET /offres/search (Offres d'emploi v2) : libellés de salaire tels que publiés. */
export const FT_OFFRES_PAGE = {
  resultats: [
    { id: "1", salaire: { libelle: "Annuel de 22404 Euros à 27000 Euros sur 12 mois" } },
    { id: "2", salaire: { libelle: "Mensuel de 1900.0 Euros à 2100.0 Euros sur 12 mois" } },
    { id: "3", salaire: { libelle: "Horaire de 11.88 Euros à 12.50 Euros sur 12 mois" } },
    { id: "4", salaire: { libelle: "Mensuel de 1800 Euros" } },
    { id: "5", salaire: { commentaire: "Selon profil" } },
    { id: "6" },
    { id: "7", salaire: { libelle: "Annuel de 9000 Euros à 10000 Euros" } },
  ],
  filtresPossibles: [],
};

// ── Fiche générée valide (textes de la fiche publiée, FAQ et certifications réécrites) ──

const acf = WP_MAGASINIER.acf;

/** Chiffres de la fiche publiée le 17/11/2026 (données du jour : pas de date_donnees). */
export const MAGASINIER_FIGURES = {
  salaire_median: 2189,
  salaire_median_moins35: 2141,
  salaire_median_plus35: 2254,
  fourchette_min: 1900,
  fourchette_max: 2290,
  fourchette_part: 80,
  offres_12m: 640,
  demandeurs: 80,
  tension: "Modérée",
};

export const MAGASINIER_META = { metier: WP_MAGASINIER.title, rome: "F1710", categorie: "Travaux publics & VRD", today: "2026-11-17" };

export function validSheet() {
  return {
    titre_complet: acf.informations_cles.titre,
    categorie: acf.informations_cles.categorie,
    definition: acf.definition,
    synonymes: acf.synonymes.map((s) => s.valeur),
    points_cles: acf.points_cles.map((s) => s.valeur),
    informations_cles_description: acf.informations_cles.description,
    certifications_texte: "Plusieurs diplômes de la logistique mènent au métier de magasinier en négoce des matériaux, du CAP au BTS, complétés par le CACES.",
    certifications_items: [
      { intitule: "CAP Opérateur/Opératrice logistique", niveau: "Niveau 3 (CAP)", duree: "2 ans" },
      { intitule: "Bac professionnel Logistique", niveau: "Niveau 4 (Bac)", duree: "3 ans" },
      { intitule: "Titre professionnel Agent magasinier", niveau: "Niveau 3", duree: "6 mois" },
      { intitule: "CACES R489 (chariots élévateurs)", niveau: "Certificat d'aptitude", duree: "3 à 5 jours" },
      { intitule: "BTS Gestion des transports et logistique associée", niveau: "Niveau 5 (Bac+2)", duree: "2 ans" },
    ],
    statistiques_texte: acf.statistiques.texte,
    salaires_texte: acf.salaires.texte,
    competences_texte: acf.competences.texte,
    competences_groupes: acf.competences.groupes.map((g) => ({ titre: g.titre, items: g.items.map((i) => i.valeur) })),
    contextes_texte: acf.contextes.texte,
    contextes_items: acf.contextes.items.map((c) => ({ ...c })),
    orientation_intro: acf.orientation.intro,
    orientation_questions: acf.orientation.questions.map((q) => ({
      question: q.question,
      options: q.options.map((o) => ({ label: o.label, points: Number(o.points) })),
    })),
    orientation_resultats: acf.orientation.resultats.map((r) => ({ min: Number(r.min), titre: r.titre, texte: r.texte })),
    faq_items: [
      {
        question: "Quel diplôme pour devenir Magasinier / Magasinière en négoce des matériaux de construction ?",
        reponse:
          "Le CAP Opérateur logistique est la voie d'accès la plus courante au métier de magasinier en négoce des matériaux. Le bac professionnel Logistique et le titre professionnel Agent magasinier conviennent aussi. Le CACES R489, indispensable pour conduire un chariot élévateur, complète presque toujours la formation demandée par les agences de négoce.",
      },
      {
        question: "Quel est le salaire d'un magasinier en négoce des matériaux ?",
        reponse:
          "Le magasinier en négoce des matériaux perçoit un salaire médian de 2 189 € brut par mois. Les moins de 35 ans gagnent environ 2 141 €, contre 2 254 € après 35 ans. Les offres d'emploi proposent le plus souvent une rémunération comprise entre 1 900 € et 2 290 € brut mensuels.",
      },
      {
        question: "Le métier de magasinier en négoce des matériaux recrute-t-il ?",
        reponse:
          "Le métier de magasinier en négoce des matériaux présente une tension de recrutement modérée. France Travail recense environ 640 offres d'emploi publiées sur les 12 derniers mois, pour 80 demandeurs d'emploi inscrits. Les agences de négoce recherchent surtout des profils titulaires du CACES et à l'aise avec la clientèle professionnelle.",
      },
      {
        question: "Quelles sont les conditions de travail d'un magasinier en négoce ?",
        reponse:
          "Le magasinier en négoce des matériaux travaille entre l'entrepôt, la cour extérieure et le comptoir de l'agence. Le poste impose le port de charges lourdes, la conduite quotidienne d'un chariot élévateur et une exposition aux intempéries. Les horaires suivent l'ouverture de l'agence, avec une forte activité tôt le matin.",
      },
      {
        question: "Quelles qualités faut-il pour être magasinier en négoce des matériaux ?",
        reponse:
          "Un bon magasinier en négoce des matériaux allie rigueur dans la gestion des stocks, résistance physique et vigilance lors de la conduite d'engins. Le sens du service compte aussi beaucoup, car le métier implique de conseiller chaque jour les artisans et les entreprises du bâtiment venus retirer leurs commandes au comptoir.",
      },
    ],
    yoast_title: WP_MAGASINIER.seo_meta.title,
    yoast_description: WP_MAGASINIER.seo_meta.metadesc,
  };
}
