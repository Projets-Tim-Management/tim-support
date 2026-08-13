import {
  CACES_TYPES,
  CONTRACT_NEEDS_END_DATE,
  CONTRACT_TYPES,
  LICENCE_PROFILE_OPTIONS,
  LICENSE_TYPES,
} from "@/modules/marketing/lib/onboarding";

/**
 * Les 5 sections du dossier de démarrage, décrites une seule fois.
 *
 * Ce registre pilote À LA FOIS le formulaire de l'espace client et la validation
 * côté serveur. Décrire les champs à deux endroits, c'est garantir qu'un jour
 * l'écran acceptera ce que l'API refuse (ou l'inverse) — le fichier Excel
 * d'origine échouait exactement là : sa consigne « champs en rouge » ne
 * correspondait à aucun contrôle réel.
 *
 * ⚠️ Les `required` ci-dessous doivent rester alignés sur les collections
 * Payload correspondantes.
 */

export type PortalFieldType = "text" | "email" | "tel" | "date" | "number" | "select" | "multiselect" | "checkbox";

export type PortalField = {
  name: string;
  label: string;
  type: PortalFieldType;
  required?: boolean;
  /** Obligatoire seulement si la condition sur un champ voisin est vraie. */
  requiredIf?: { field: string; truthy?: true; notEquals?: string };
  /** Affiché seulement si la condition est vraie (mêmes règles). */
  showIf?: { field: string; truthy?: true; notEquals?: string };
  options?: readonly { label: string; value: string }[];
  placeholder?: string;
  hint?: string;
  half?: boolean;
};

export type PortalSection = {
  key: string;
  label: string;
  /** Titre au singulier, pour les boutons (« Ajouter un salarié »). */
  singular: string;
  collection: string;
  intro: string;
  /** Nombre de lignes minimum pour considérer la section complète. */
  min: number;
  /** Colonnes du tableau récapitulatif. */
  columns: string[];
  fields: PortalField[];
};

const evaluate = (
  cond: { field: string; truthy?: true; notEquals?: string } | undefined,
  row: Record<string, unknown>,
): boolean => {
  if (!cond) return true;
  const value = row[cond.field];
  if (cond.truthy) return Boolean(value);
  if (cond.notEquals !== undefined) return Boolean(value) && value !== cond.notEquals;
  return Boolean(value);
};

/** Le champ doit-il être affiché pour cette ligne ? */
export const fieldVisible = (field: PortalField, row: Record<string, unknown>): boolean =>
  evaluate(field.showIf, row);

/** Le champ est-il obligatoire pour cette ligne ? */
export const fieldRequired = (field: PortalField, row: Record<string, unknown>): boolean =>
  Boolean(field.required) || (Boolean(field.requiredIf) && evaluate(field.requiredIf, row));

export const PORTAL_SECTIONS: PortalSection[] = [
  {
    key: "administrateur",
    label: "Administrateur",
    singular: "administrateur",
    collection: "client-contacts",
    min: 1,
    intro:
      "La personne qui administrera TIM chez vous. C'est elle que nous contactons pour tout ce qui concerne votre test.",
    columns: ["firstName", "lastName", "email"],
    fields: [
      { name: "firstName", label: "Prénom", type: "text", required: true, half: true },
      { name: "lastName", label: "Nom", type: "text", required: true, half: true },
      { name: "email", label: "Adresse e-mail", type: "email", required: true, half: true },
      { name: "phone", label: "Téléphone", type: "tel", half: true, placeholder: "+33 6 12 34 56 78" },
      { name: "role", label: "Fonction", type: "text", placeholder: "Dirigeant, DAF, responsable travaux…" },
    ],
  },
  {
    key: "salaries",
    label: "Salariés",
    singular: "salarié",
    collection: "client-employees",
    min: 1,
    intro:
      "Tout votre effectif entre dans TIM (pointage, planning, affectation aux chantiers). Cochez « Accès TIM » uniquement sur les personnes qui utiliseront le logiciel : ce sont elles qui consomment une licence.",
    columns: ["matricule", "firstName", "lastName", "poste", "isUser"],
    fields: [
      {
        name: "matricule",
        label: "Matricule",
        type: "text",
        half: true,
        hint: "Laissez vide si vous n'en utilisez pas : nous en générons un.",
      },
      { name: "company", label: "Société", type: "text", required: true, half: true },
      { name: "firstName", label: "Prénom", type: "text", required: true, half: true },
      { name: "lastName", label: "Nom", type: "text", required: true, half: true },
      {
        name: "poste",
        label: "Poste",
        type: "text",
        half: true,
        placeholder: "Maçon, coffreur, grutier…",
        hint: "Le métier réel, pas le profil de licence.",
      },
      { name: "address", label: "Adresse", type: "text", half: true },
      {
        name: "isUser",
        label: "Accès TIM (consomme une licence)",
        type: "checkbox",
      },
      {
        name: "licenceProfile",
        label: "Priorité",
        type: "select",
        options: LICENCE_PROFILE_OPTIONS,
        requiredIf: { field: "isUser", truthy: true },
        showIf: { field: "isUser", truthy: true },
        half: true,
        hint: "Le profil de licence de cette personne.",
      },
      {
        name: "email",
        label: "Adresse e-mail",
        type: "email",
        requiredIf: { field: "isUser", truthy: true },
        half: true,
        hint: "Obligatoire pour un utilisateur : c'est son identifiant de connexion.",
      },
      { name: "phone", label: "Téléphone", type: "tel", half: true },
      { name: "nationality", label: "Nationalité", type: "text", half: true, placeholder: "Française" },
      { name: "birthDate", label: "Date de naissance", type: "date", half: true },
      {
        name: "contractType",
        label: "Type de contrat",
        type: "select",
        options: CONTRACT_TYPES,
        half: true,
      },
      {
        name: "contractEndDate",
        label: "Date de fin de contrat",
        type: "date",
        requiredIf: { field: "contractType", notEquals: "cdi" },
        showIf: { field: "contractType", notEquals: "cdi" },
        half: true,
      },
    ],
  },
  {
    key: "chantiers",
    label: "Chantiers",
    singular: "chantier",
    collection: "client-sites",
    min: 1,
    intro: "Les chantiers ouverts pendant votre période de test — c'est là que vos équipes pointeront.",
    columns: ["code", "name", "address", "startDate"],
    fields: [
      { name: "name", label: "Nom du chantier", type: "text", required: true, half: true },
      {
        name: "code",
        label: "Code chantier",
        type: "text",
        required: true,
        half: true,
        hint: "Votre référence interne.",
      },
      { name: "address", label: "Adresse du chantier", type: "text", required: true },
      { name: "startDate", label: "Date de début", type: "date", required: true, half: true },
      {
        name: "endDate",
        label: "Date de fin",
        type: "date",
        required: true,
        half: true,
        hint: "Prévisionnelle si la date exacte n'est pas connue.",
      },
      { name: "zone", label: "Zone de chantier", type: "text" },
    ],
  },
  {
    key: "vehicules",
    label: "Véhicules",
    singular: "véhicule",
    collection: "client-vehicles",
    min: 0,
    intro: "Facultatif — à remplir si vous suivez votre flotte dans TIM.",
    columns: ["brand", "year", "plate", "insuranceDate"],
    fields: [
      { name: "brand", label: "Marque du véhicule", type: "text", required: true, half: true, placeholder: "Renault Master" },
      { name: "year", label: "Année", type: "number", required: true, half: true },
      { name: "plate", label: "Immatriculation", type: "text", required: true, half: true, placeholder: "AB-123-CD" },
      { name: "insuranceDate", label: "Date d'assurance", type: "date", required: true, half: true },
      { name: "licenseTypes", label: "Type de permis", type: "multiselect", options: LICENSE_TYPES, required: true },
    ],
  },
  {
    key: "engins",
    label: "Engins",
    singular: "engin",
    collection: "client-machines",
    min: 0,
    intro: "Facultatif — engins de chantier et certifications CACES associées.",
    columns: ["brand", "year", "serial", "insuranceDate"],
    fields: [
      { name: "brand", label: "Marque de l'engin", type: "text", required: true, half: true, placeholder: "Caterpillar 320" },
      { name: "year", label: "Année", type: "number", required: true, half: true },
      {
        name: "serial",
        label: "Immatriculation / n° de série",
        type: "text",
        required: true,
        half: true,
        hint: "La plaque si l'engin en a une, sinon le numéro de série.",
      },
      { name: "insuranceDate", label: "Date d'assurance", type: "date", required: true, half: true },
      { name: "cacesTypes", label: "Type de CACES", type: "multiselect", options: CACES_TYPES, required: true },
    ],
  },
];

export const sectionByKey = (key?: string): PortalSection | undefined =>
  PORTAL_SECTIONS.find((s) => s.key === key);

/**
 * Valide une ligne contre le registre. Renvoie les messages par champ, vide si
 * tout va bien. Utilisée par l'API (source d'autorité) et par le formulaire
 * (retour immédiat) — même code, donc mêmes règles des deux côtés.
 */
export const validateRow = (
  section: PortalSection,
  row: Record<string, unknown>,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const field of section.fields) {
    if (!fieldVisible(field, row)) continue;
    const value = row[field.name];
    const empty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (fieldRequired(field, row) && empty) {
      errors[field.name] = "Ce champ est obligatoire.";
      continue;
    }
    if (empty) continue;

    if (field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
      errors[field.name] = "Adresse e-mail invalide.";
    }
  }

  // Cohérence des dates de chantier : contrôlée ici ET dans la collection.
  if (section.key === "chantiers" && row.startDate && row.endDate) {
    if (Date.parse(String(row.endDate)) < Date.parse(String(row.startDate))) {
      errors.endDate = "La fin ne peut pas précéder le début.";
    }
  }

  // Le contrat n'a de date de fin que s'il n'est pas un CDI.
  if (section.key === "salaries" && !CONTRACT_NEEDS_END_DATE(row.contractType as string)) {
    delete errors.contractEndDate;
  }

  return errors;
};
