/**
 * Formulaires du site vitrine — source de vérité unique.
 *
 * Le site vitrine ne code plus ses formulaires : il lit une définition servie par
 * le support et la rend. Ce fichier décrit ce qu'une définition peut contenir, et
 * porte le contenu du formulaire livré avec le code (`DEMO_FORM`), semé au
 * démarrage puis modifiable en back-office.
 *
 * Pourquoi une définition et non du code : ajouter un champ, corriger un libellé
 * ou rendre une question facultative sont des décisions marketing qui se prenaient
 * jusqu'ici dans l'interface Brevo, sans déploiement. Les faire redescendre dans
 * une PR aurait été une régression déguisée en modernisation.
 *
 * ⚠️ Les `name` de champs et les `value` d'options sont des IDENTIFIANTS : ils
 * voyagent dans les soumissions déjà enregistrées et dans le code de la vitrine.
 * Les renommer casse la lecture de l'historique. Les LIBELLÉS, eux, se changent
 * librement — c'est tout l'intérêt.
 */

/** Types de champs qu'un formulaire peut déclarer. */
export const FIELD_TYPES = [
  { label: "Texte", value: "text" },
  { label: "E-mail", value: "email" },
  { label: "Téléphone", value: "tel" },
  { label: "Liste", value: "select" },
  { label: "Liste à choix multiples", value: "multiselect" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];

/** Types qui exigent des options : une liste sans choix ne se rend pas. */
export const CHOICE_TYPES: FieldType[] = ["select", "multiselect"];

/**
 * Où le formulaire était posé au moment de la soumission.
 *
 * C'est une dimension d'ATTRIBUTION, pas une propriété du formulaire : la même
 * définition est servie dans le tiroir global et dans le hero d'une landing page,
 * et c'est justement ce qu'on veut pouvoir distinguer dans les statistiques.
 */
export const PLACEMENTS = [
  { label: "Tiroir global", value: "drawer" },
  { label: "Page contact", value: "page-contact" },
  { label: "Hero de landing page", value: "lp-hero" },
  { label: "Section de landing page", value: "lp-section" },
] as const;

export type Placement = (typeof PLACEMENTS)[number]["value"];

/**
 * Canal d'acquisition — ce que porte le champ `source` d'une opportunité.
 *
 * Volontairement court : l'utilisateur a confirmé le 04/09/2026 qu'il n'y a pas
 * d'autre canal à prévoir. Chaque valeur ajoutée ici coûte une migration d'enum.
 */
export const CHANNELS = [
  { label: "Site vitrine — SEO", value: "seo" },
  { label: "Google Ads — SEA", value: "sea" },
] as const;

export type Channel = (typeof CHANNELS)[number]["value"];

export const channelLabel = (value?: string | null): string | undefined =>
  CHANNELS.find((c) => c.value === value)?.label;

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDef {
  name: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  maxLength?: number;
  /** Champ téléphone : la vitrine affiche un sélecteur d'indicatif. */
  countryCode?: boolean;
  helpText?: string;
  options?: FormFieldOption[];
}

export interface FormDef {
  formId: string;
  label: string;
  defaultChannel: Channel;
  successText: string;
  errorText: string;
  legalNotice?: string;
  fields: FormFieldDef[];
}

/** Identifiant du formulaire unique servi par tout le site. */
export const DEMO_FORM_ID = "demo";

/**
 * Le formulaire de demande de démo.
 *
 * UN SEUL formulaire pour tout le site — page contact, tiroir global et les deux
 * landing pages. Il y en avait deux chez Brevo, l'un privé de `besoins` et
 * `pays` ; l'utilisateur a demandé le 04/09/2026 que tous les leads reçoivent le
 * même accusé de réception, ce qui suppose les mêmes réponses, donc les mêmes
 * champs. Deux définitions identiques n'auraient été qu'une occasion de dériver.
 *
 * La traçabilité ne repose donc PAS sur l'identité du formulaire mais sur les
 * métadonnées d'attribution de chaque soumission (placement, page, variante,
 * campagne) — c'est leur rôle, et elles savent distinguer les cinq contextes
 * depuis lesquels une même landing page est atteignable.
 *
 * Libellés et options relevés sur les formulaires Brevo réels (parsing des pages
 * `sibforms.com`), à trois corrections près, toutes assumées :
 *  - « Dans quel pays se trouve votre entreprise » manquait son point
 *    d'interrogation ;
 *  - le libellé « Quel est votre nom ? » couvrait la civilité ET le nom, ce qui
 *    laissait la première sans intitulé propre ;
 *  - `JOB_TITLE` (attribut Brevo détourné) devient `company_name`, ce qu'il a
 *    toujours signifié : « Quel est le nom de votre société ? ».
 */
export const DEMO_FORM: FormDef = {
  formId: DEMO_FORM_ID,
  label: "Demande de démo",
  defaultChannel: "seo",
  successText: "Votre message a bien été envoyé.",
  /**
   * Volontairement différent de celui de Brevo, qui se terminait par la phrase de
   * succès (« Nous n'avons pas pu confirmer votre inscription. Votre message a
   * bien été envoyé. ») : un prospect dont l'envoi échouait croyait avoir réussi.
   */
  errorText:
    "Votre demande n'a pas pu être envoyée. Vérifiez les champs signalés, puis réessayez.",
  /** Rédigée à l'étape 7, après validation juridique. Vide = rien n'est affiché. */
  legalNotice: "",
  fields: [
    {
      name: "company_name",
      type: "text",
      label: "Quel est le nom de votre société ?",
      placeholder: "Vinci",
      required: true,
      maxLength: 200,
    },
    {
      name: "collaborateurs",
      type: "select",
      label: "Combien de collaborateurs compte votre entreprise ?",
      required: true,
      options: [
        { value: "1-10", label: "1 - 10" },
        { value: "11-25", label: "11 - 25" },
        { value: "26-50", label: "26 - 50" },
        { value: "51-100", label: "51 - 100" },
        { value: "101-250", label: "101 - 250" },
        { value: "250-500", label: "250 - 500" },
        { value: "500-plus", label: "+500" },
      ],
    },
    {
      name: "fonction",
      type: "select",
      label: "Quelle fonction occupez-vous ?",
      required: false,
      options: [
        { value: "dirigeant", label: "Dirigeant" },
        { value: "employe", label: "Employé" },
        { value: "ouvrier", label: "Ouvrier" },
      ],
    },
    {
      name: "pays",
      type: "select",
      label: "Dans quel pays se trouve votre entreprise ?",
      required: false,
      options: [
        { value: "france", label: "France" },
        { value: "belgique", label: "Belgique" },
        { value: "suisse", label: "Suisse" },
        { value: "luxembourg", label: "Luxembourg" },
      ],
    },
    {
      name: "besoins",
      type: "multiselect",
      label: "Quels sont vos besoins ?",
      required: true,
      helpText: "Choisissez au moins une option.",
      options: [
        { value: "planning", label: "Planning" },
        { value: "pointage", label: "Pointage" },
        { value: "vehicules", label: "Gestion des véhicules" },
        { value: "chantiers", label: "Gestion des chantiers" },
        { value: "documents-rh", label: "Gestion des documents RH" },
      ],
    },
    {
      name: "genre",
      type: "select",
      label: "Civilité",
      required: true,
      options: [
        { value: "mr", label: "Mr" },
        { value: "mme", label: "Mme" },
      ],
    },
    {
      name: "nom",
      type: "text",
      label: "Quel est votre nom ?",
      placeholder: "Eiffel",
      required: true,
      maxLength: 200,
    },
    {
      name: "email",
      type: "email",
      label: "Quel est votre email ?",
      placeholder: "gustave@vinci.com",
      required: true,
    },
    {
      name: "telephone",
      type: "tel",
      label: "Quel est votre numéro de téléphone ?",
      required: true,
      countryCode: true,
    },
  ],
};

/** Formulaires livrés avec le code, semés au démarrage. */
export const SEEDED_FORMS: FormDef[] = [DEMO_FORM];

/**
 * Nom du champ leurre.
 *
 * Repris à l'identique de Brevo : c'était leur SEULE protection anti-spam, et la
 * reproduire coûte une ligne. Un robot qui remplit ce champ obtient une réponse
 * de succès sans qu'aucune ligne ne soit écrite — lui dire qu'il a été repéré
 * l'inviterait à réessayer autrement.
 */
export const HONEYPOT_FIELD = "email_address_check";
