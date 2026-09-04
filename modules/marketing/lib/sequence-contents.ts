/**
 * Les séquences livrées avec le code, semées au démarrage.
 *
 * Une fois créées, elles appartiennent à l'équipe : le semis ne réécrit jamais
 * ce qui a été modifié en back-office. Ces textes sont un point de départ, pas
 * une référence.
 *
 * Le ton visé est celui de quelqu'un qui connaît le métier : une scène que le
 * lecteur reconnaît, ce qu'elle cache, ce que Tim y change, une phrase qui
 * reste. Pas de liste à puces — c'est ce qui fait « documentation ».
 */

const SITE = "https://tim-management.co";

export interface SeedMessage {
  key: string;
  style: "marketing" | "standard";
  delayValue: number;
  delayUnit: "jours" | "semaines" | "mois";
  besoin?: string;
  title: string;
  subject: string;
  paragraphs: string[];
  payoff: string;
  /** Le bouton n'existe que dans le style marketing. */
  cta?: string;
  url?: string;
}

export interface SeedSequence {
  key: string;
  label: string;
  description: string;
  lossReasons: string[];
  active: boolean;
  /** Une réponse du prospect interrompt-elle les envois restants ? */
  stopOnReply: boolean;
  /** Séquence ouverte automatiquement quand tous les messages sont partis. */
  nextSequenceKey?: string;
  /** Doit être un expéditeur vérifié chez Brevo. */
  fromEmail: string;
  /**
   * Formule de politesse. La signature qui suit vient de la fiche du partenaire
   * de l'opportunité — il n'y a rien à recopier ici.
   */
  signature: string;
  messages: SeedMessage[];
}

/** Tous les motifs de perte SAUF « sans réponse », qui a sa propre séquence. */
const MARKETING_REASONS = [
  "prix",
  "fonctionnalites",
  "concurrent",
  "budget",
  "pas-le-moment",
  "besoin-different",
  "solution-interne",
  "test-non-concluant",
  "a-qualifier",
  "autre",
];

export const SEED_SEQUENCES: SeedSequence[] = [
  {
    key: "marketing",
    label: "Marketing",
    description:
      "Sept messages sur quatorze mois, un thème à la fois. Ouverte quand une affaire est perdue pour un motif autre que l'absence de réponse.",
    lossReasons: MARKETING_REASONS,
    active: true,
    /**
     * Une réponse à une campagne n'arrête RIEN.
     *
     * « Merci, pas pour l'instant » n'est pas une demande de désinscription :
     * couper là priverait le prospect des messages suivants sans qu'il l'ait
     * demandé, et ces messages sont justement conçus pour le retrouver plus
     * tard. La réponse est inscrite sur sa fiche, et c'est tout.
     */
    stopOnReply: false,
    fromEmail: "info@tim-management.fr",
    signature: "Excellente journée,",
    messages: [
      {
        key: "planning-ouvrier",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "planning",
        title: "Quand le planning saute à 6 h 40",
        subject: "Quand le planning saute à 6 h 40",
        paragraphs: [
          "Un ouvrier qui ne viendra pas, un chantier qui a bougé, et le planning de la semaine est déjà faux.",
          "Vous le refaites dans l'urgence, puis vous passez la matinée à prévenir tout le monde — en espérant n'oublier personne.",
          "Ce n'est pas un problème d'organisation, c'est un problème de visibilité. Tant que le planning vit dans un tableur et dans votre tête, chaque imprévu coûte une demi-journée.",
          "Avec Tim, les équipes et les chantiers tiennent sur une seule vue. Vous déplacez quelqu'un, l'absence est déjà prise en compte, et le planning reste juste.",
        ],
        payoff: "L'idée n'est pas d'avoir un outil de plus, c'est d'avoir moins de matinées à rattraper.",
        cta: "Voir à quoi ressemblerait votre planning",
        url: `${SITE}/plannings-ouvriers`,
      },
      {
        key: "pointage",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "pointage",
        title: "Les heures qu'on retrouve le vendredi",
        subject: "Les heures qu'on retrouve le vendredi",
        paragraphs: [
          "Des heures notées sur un carnet, des feuilles ramassées en fin de semaine, et un total qui ne tombe jamais tout à fait juste.",
          "Personne ne triche. C'est simplement qu'entre le chantier et le bureau, il se perd toujours quelque chose.",
          "Avec Tim, vos équipes pointent depuis leur téléphone, sur le chantier. Les heures remontent au fil de la journée, avec les absences, les intempéries et les heures supplémentaires.",
        ],
        payoff: "Ce n'est pas du contrôle en plus. C'est de la ressaisie en moins.",
        cta: "Voir comment vos équipes pointeraient",
        url: `${SITE}/pointage-digital-mobile-chantier`,
      },
      {
        key: "feuilles-heures",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "pointage",
        title: "Deux jours par mois sur un tableur",
        subject: "Deux jours par mois sur un tableur",
        paragraphs: [
          "Recopier les heures, vérifier ligne à ligne, recommencer quand un total ne tombe pas juste.",
          "C'est un travail que personne ne réclame et que tout le monde subit — et qui repousse la paie de deux jours chaque mois.",
          "Chez Tim, la feuille d'heures se remplit pendant que les équipes pointent. À la fin du mois elle est déjà là, et l'export pour la paie tient en un clic.",
        ],
        payoff: "Le temps gagné ne se voit pas sur le chantier. Il se voit le 30.",
        cta: "Voir une feuille d'heures",
        url: `${SITE}/feuilles-dheures-btp`,
      },
      {
        key: "suivi-chantier",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "chantiers",
        title: "On s'en aperçoit à la facture",
        subject: "On s'en aperçoit à la facture",
        paragraphs: [
          "Le chantier était prévu en douze jours. Il en a pris seize. Vous le découvrez en facturant.",
          "À ce moment-là il n'y a plus rien à faire : les heures sont passées, la marge aussi.",
          "Avec Tim, vous voyez les heures s'accumuler chantier par chantier, et l'écart avec ce qui était prévu, pendant que le chantier tourne encore.",
        ],
        payoff: "Un chantier qui dérape se rattrape. Un chantier terminé, non.",
        cta: "Voir le suivi d'un chantier",
        url: `${SITE}/suivi-chantier`,
      },
      {
        key: "planning-engins",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "vehicules",
        title: "La mini-pelle que personne ne trouve",
        subject: "La mini-pelle que personne ne trouve",
        paragraphs: [
          "Deux chantiers la réclament le même jour. Vous en louez une, et vous apprenez le lendemain que la vôtre était libre.",
          "Le tableur des engins existe. Son problème, c'est que personne ne le met à jour — et qu'on ne peut donc pas s'y fier.",
          "Avec Tim, les engins ont leur planning, comme les équipes. Vous savez qui utilise quoi, jusqu'à quand, et quand la machine se libère.",
        ],
        payoff: "Le matériel qu'on retrouve coûte moins cher que celui qu'on loue.",
        cta: "Voir le planning de vos engins",
        url: `${SITE}/plannings-engins`,
      },
      {
        key: "documents-rh",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        besoin: "documents-rh",
        title: "Le contrat qu'on cherche un mardi matin",
        subject: "Le contrat qu'on cherche un mardi matin",
        paragraphs: [
          "Une visite médicale qu'on croyait à jour, un contrat rangé quelque part, et trois classeurs à ouvrir parce qu'on vous le demande maintenant.",
          "Le classement n'est pas le problème. Le problème, c'est de ne pas retrouver — et de s'en apercevoir au mauvais moment.",
          "Avec Tim, contrats, absences et congés sont rattachés à la bonne personne, et vous êtes prévenu avant qu'une échéance tombe.",
        ],
        payoff: "Ce n'est pas le rangement qui coûte cher. C'est la recherche.",
        cta: "Voir la gestion des documents",
        url: `${SITE}/employes-rh`,
      },
      {
        key: "analytique",
        style: "marketing",
        delayValue: 2,
        delayUnit: "mois",
        title: "Vos chantiers rentables, ce sont lesquels ?",
        subject: "Vos chantiers rentables, ce sont lesquels ?",
        paragraphs: [
          "Vous savez que certains chantiers rapportent et d'autres non. La question, c'est de savoir lesquels — et pourquoi.",
          "Sans les heures réelles, la réponse reste une impression. Et on refait l'année suivante les mêmes devis, avec les mêmes marges.",
          "Tim rapproche ce qui était prévu de ce qui a été consommé, chantier par chantier. Vous voyez où partent les heures, et ce que chaque chantier a réellement coûté.",
        ],
        payoff: "On ne pilote pas ce qu'on ne mesure pas.",
        cta: "Voir vos chiffres",
        url: `${SITE}/chiffre-analytique`,
      },
    ],
  },

  {
    key: "sans-retour",
    label: "Sans retour",
    description:
      "Trois relances courtes quand l'affaire s'est arrêtée faute de réponse. Le but n'est pas de vendre, mais de savoir si le projet existe encore.",
    lossReasons: ["sans-reponse"],
    /**
     * INACTIVE tant que le contenu n'a pas été validé : une séquence active
     * enrôlerait dès la première affaire close pour absence de réponse, et
     * partirait avec des textes que personne n'a relus.
     */
    active: false,
    /**
     * Une réponse arrête tout : c'est exactement ce que ces trois messages
     * demandent. Continuer après « oui, on est toujours dessus » serait le
     * meilleur moyen de perdre ce qu'on vient d'obtenir.
     */
    stopOnReply: true,
    /**
     * À la fin des trois relances, le prospect bascule en campagne.
     *
     * Il n'a jamais répondu — la discussion est close, mais rien ne dit que le
     * besoin a disparu. La campagne prend le relais sur un rythme beaucoup plus
     * lent, et c'est ELLE qui le retrouvera dans six mois ou dans un an.
     */
    nextSequenceKey: "marketing",
    /**
     * Adresse de repli seulement : l'envoi part de l'adresse du partenaire de
     * l'opportunité dès qu'elle est utilisable chez Brevo, puisque c'est lui qui
     * signe. Celle-ci ne sert que si la sienne ne l'est pas.
     */
    fromEmail: "cpiancatelli@tim-management.co",
    signature: "Bien cordialement,",
    messages: [
      {
        key: "toujours-actualite",
        style: "standard",
        delayValue: 3,
        delayUnit: "semaines",
        title: "Toujours d'actualité ?",
        subject: "Votre projet est-il toujours d'actualité ?",
        paragraphs: [
          "On s'était parlé, puis plus rien — ce qui arrive, un chantier prend le dessus et le reste attend.",
          "Je ne vous relance pas pour vous vendre quelque chose. Juste pour savoir si le sujet est encore ouvert de votre côté, ou si on en reste là.",
          "Un mot suffit, même « pas pour l'instant ».",
        ],
        payoff: "Si ce n'est plus d'actualité, dites-le-moi : je cesserai de vous écrire.",
      },
      {
        key: "on-garde-le-dossier",
        style: "standard",
        delayValue: 1,
        delayUnit: "mois",
        title: "On garde votre dossier ?",
        subject: "On garde votre dossier ouvert ?",
        paragraphs: [
          "Votre demande est toujours chez nous, avec ce que vous nous aviez indiqué.",
          "Si le moment n'est pas le bon, ce n'est pas grave — beaucoup reviennent six mois plus tard, au moment où la saison se calme.",
          "Dites-moi simplement si je le garde ouvert ou si je le referme.",
        ],
        payoff: "Un dossier fermé se rouvre. Ça ne coûte rien de le dire.",
      },
      {
        key: "on-en-reste-la",
        style: "standard",
        delayValue: 2,
        delayUnit: "mois",
        title: "On en reste là",
        subject: "On en reste là — et la porte reste ouverte",
        paragraphs: [
          "Sans retour de votre part, je referme votre dossier. C'est plus honnête que de continuer à vous écrire.",
          "Rien n'est perdu : si le sujet revient, un message suffit et on repart d'où on s'était arrêtés.",
          "Bonne continuation sur vos chantiers.",
        ],
        payoff: "La porte reste ouverte, sans que vous ayez à vous justifier.",
      },
    ],
  },
];
