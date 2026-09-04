/**
 * Formulaires du site vitrine — source de vérité unique.
 *
 * Le site lit une définition servie par le support et la rend. Une définition et
 * non du code : corriger un libellé ou rendre une question facultative sont des
 * décisions marketing, qui se prenaient sans déploiement du temps de Brevo.
 *
 * ⚠️ Les `name` de champs et les `value` d'options sont des IDENTIFIANTS : ils
 * voyagent dans les soumissions déjà enregistrées. Les libellés, eux, se
 * changent librement.
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
 * Où le formulaire était posé. Dimension d'ATTRIBUTION, pas propriété du
 * formulaire : la même définition sert le tiroir global et le hero d'une LP.
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
 * Liste fermée (décision du 04/09/2026) ; chaque valeur coûte une migration.
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
 * Le formulaire de demande de démo — UN SEUL pour tout le site.
 *
 * Brevo en avait deux, celui des landing pages privé de `besoins` et `pays`.
 * Tous les leads devant recevoir le même accusé de réception (décision du
 * 04/09/2026), ils ont les mêmes champs : deux définitions identiques n'auraient
 * été qu'une occasion de dériver. La traçabilité repose sur les métadonnées
 * d'attribution de chaque soumission, pas sur l'identité du formulaire.
 *
 * Libellés relevés sur les formulaires Brevo réels, à trois corrections près :
 * le point d'interrogation manquant de « pays », la civilité qui n'avait pas
 * d'intitulé propre, et `JOB_TITLE` → `company_name` (attribut détourné).
 */
export const DEMO_FORM: FormDef = {
  formId: DEMO_FORM_ID,
  label: "Demande de démo",
  defaultChannel: "seo",
  successText: "Votre message a bien été envoyé.",
  // Celui de Brevo se terminait par la phrase de succès : un prospect dont
  // l'envoi échouait croyait avoir réussi.
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
 * Champ leurre, repris à l'identique de Brevo — c'était leur seule protection
 * anti-spam. Rempli = réponse de succès, aucune écriture.
 */
export const HONEYPOT_FIELD = "email_address_check";
