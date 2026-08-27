import { validatePhone } from "@/core/lib/validators";
import {
  CONTRACT_NEEDS_END_DATE,
  CONTRACT_TYPES,
  LICENCE_PROFILE_OPTIONS,
} from "@/modules/marketing/lib/onboarding";
import { COUNTRIES, SITE_ZONES } from "@/modules/marketing/lib/reference-lists";

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

export type PortalFieldType = "text" | "email" | "tel" | "date" | "number" | "select" | "checkbox";

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
  /**
   * Colonne réservée à TIM : absente du tableau de l'espace client, présente
   * dans celui du back-office. Le client la LIT ailleurs (sa page d'accès), il
   * ne la saisit jamais.
   */
  adminOnly?: boolean;
  /** Valeur produite par le logiciel : affichée, jamais éditable. */
  readOnly?: boolean;
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
    label: "Utilisateurs TIM",
    singular: "utilisateur",
    collection: "client-contacts",
    min: 1,
    // La clé reste « administrateur » : elle est dans l'URL des pages du dossier
    // et dans la table des icônes. Le libellé, lui, décrit ce que la section est
    // devenue — une liste d'utilisateurs avec leur profil de licence, et non plus
    // la seule personne à contacter.
    intro:
      "Les personnes qui utiliseront TIM chez vous, avec leur profil de licence. Nous créons leurs accès à partir de cette liste ; vous les récupérez dans votre espace et vous les leur remettez vous-même.",
    columns: ["firstName", "lastName", "email", "licenceProfile"],
    fields: [
      { name: "firstName", label: "Prénom", type: "text", required: true, half: true },
      { name: "lastName", label: "Nom", type: "text", required: true, half: true },
      { name: "email", label: "Adresse e-mail", type: "email", required: true, half: true },
      { name: "phone", label: "Téléphone", type: "tel", half: true, placeholder: "+33 6 12 34 56 78" },
      {
        // Généré par TIM, lu par le client sur sa page d'accès. Il vit dans la
        // même table que l'utilisateur : les comptes sont créés DANS TIM, on ne
        // stocke ici que ce qui doit être distribué aux équipes.
        //
        // L'identifiant de connexion est l'ADRESSE E-MAIL ci-dessus : rien à
        // générer de ce côté, et une chose de moins à recopier sur une fiche
        // qu'un chef d'équipe lira sur un chantier.
        name: "timPassword",
        label: "Mot de passe TIM",
        type: "text",
        adminOnly: true,
        readOnly: true,
      },
      {
        // Profil de licence, et non plus une « fonction » en texte libre : c'est
        // cette valeur qui décide du compte TIM à créer et de la ligne du devis.
        // Liste fermée reprise de la grille tarifaire, donc aucun écart possible
        // entre ce que le client déclare et ce qu'on facture.
        name: "licenceProfile",
        label: "Profil de licence",
        type: "select",
        required: true,
        options: LICENCE_PROFILE_OPTIONS,
      },
    ],
  },
  {
    key: "salaries",
    label: "Salariés",
    singular: "salarié",
    collection: "client-employees",
    min: 1,
    intro:
      "Tout votre effectif entre dans TIM : pointage, planning, affectation aux chantiers. Les personnes qui utiliseront le logiciel se déclarent à part, dans « Utilisateurs TIM ».",
    columns: ["matricule", "firstName", "lastName", "poste"],
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
      // Ni « Accès TIM », ni « Priorité », ni adresse e-mail ici : les licences se
      // déclarent dans « Utilisateurs TIM », avec leur profil. Deux endroits pour
      // dire la même chose donnaient deux comptages possibles — et donc deux
      // devis possibles. Les champs restent en base, seule la saisie déménage.
      { name: "phone", label: "Téléphone", type: "tel", half: true },
      { name: "nationality", label: "Nationalité", type: "select", options: COUNTRIES, half: true },
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
      { name: "zone", label: "Zone de chantier", type: "select", options: SITE_ZONES },
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
      { name: "licenseTypes", label: "Type de permis", type: "text", required: true, placeholder: "B, C1E" },
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
      { name: "cacesTypes", label: "Type de CACES", type: "text", required: true, placeholder: "R482 B1, R489 3" },
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

    // Téléphone : même règle que les fiches du back-office (validatePhone), pour
    // qu'un numéro accepté ici ne soit pas refusé là-bas. Un contrôle de saisie
    // qui diverge d'un écran à l'autre est pire que pas de contrôle du tout.
    if (field.type === "tel") {
      const verdict = validatePhone(value);
      if (verdict !== true) errors[field.name] = verdict;
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
