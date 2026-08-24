import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { COUNTRIES } from "@/modules/marketing/lib/reference-lists";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { validateEmail, validatePhone } from "@/core/lib/validators";
import {
  clientField,
  displayNameField,
  partnerField,
  setPartnerFromClient,
} from "@/modules/marketing/collections/clientOwned";
import {
  CONTRACT_NEEDS_END_DATE,
  CONTRACT_TYPES,
  LICENCE_PROFILE_OPTIONS,
} from "@/modules/marketing/lib/onboarding";

/**
 * Salariés d'un client — section « Salariés » du dossier de démarrage.
 *
 * ⚠️ Un salarié n'est PAS un utilisateur. L'effectif entier entre dans TIM
 * (pointage, planning, affectation chantier) ; une entreprise de 40 salariés
 * peut n'avoir que 12 utilisateurs — et le devis porte sur les 12. C'est la
 * distinction que le fichier Excel d'origine ne faisait pas, et la raison n°1 de
 * passer en interne.
 *
 * Les LICENCES ne se déclarent plus ici : elles vivent sur les utilisateurs du
 * client (« Utilisateurs TIM »), qui sont aussi ceux qui portent un accès au
 * logiciel. Les champs « Accès TIM » et « Profil de licence » ci-dessous ne sont
 * donc plus proposés à la saisie nulle part — ni dans l'espace client, ni dans
 * la console de préparation — et ne restent que pour lire les dossiers remplis
 * avant ce changement. Plus rien ne les compte.
 */

/** Titre lisible (drawer + colonnes) : prénom + nom, repli matricule. */
const setDisplayName: CollectionBeforeChangeHook = ({ data }) => {
  const full = [data?.firstName, data?.lastName].filter(Boolean).join(" ").trim();
  data.displayName = full || data?.matricule || "Salarié";
  return data;
};

/**
 * Matricule auto si laissé vide : le fichier client le demandait mais beaucoup
 * d'entreprises n'en ont pas. Plutôt que de bloquer la saisie, on en génère un
 * lisible et stable (SAL-0001) à partir du nombre de salariés déjà enregistrés
 * chez ce client.
 */
const autoMatricule: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== "create" || data?.matricule) return data;
  const clientRef = data?.client;
  const clientId = typeof clientRef === "object" ? (clientRef as { id: unknown })?.id : clientRef;
  if (clientId == null) return data;
  try {
    const res = await req.payload.count({
      collection: "client-employees",
      where: { client: { equals: clientId } },
      overrideAccess: true,
      req,
    });
    data.matricule = `SAL-${String((res.totalDocs ?? 0) + 1).padStart(4, "0")}`;
  } catch {
    /* comptage indisponible → matricule laissé vide (non bloquant) */
  }
  return data;
};

/** Un salarié sans accès TIM ne porte pas de profil de licence (sinon il compterait dans le devis). */
const clearProfileWhenNotUser: CollectionBeforeChangeHook = ({ data }) => {
  if (!data?.isUser) data.licenceProfile = null;
  return data;
};

export const ClientEmployees: CollectionConfig = {
  slug: "client-employees",
  labels: { singular: "Salarié", plural: "Salariés" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["matricule", "firstName", "lastName", "poste", "isUser", "licenceProfile"],
    // Géré via le champ `join` de la fiche client → jamais dans le menu latéral.
    hidden: true,
  },
  disableDuplicate: true,
  access: metierOwnedAccess,
  hooks: {
    beforeChange: [
      setPartnerFromClient,
      enforcePartnerField(),
      autoMatricule,
      clearProfileWhenNotUser,
      setDisplayName,
    ],
  },
  fields: [
    clientField,
    {
      type: "row",
      fields: [
        {
          name: "matricule",
          type: "text",
          label: "Matricule",
          admin: { width: "34%", description: "Généré automatiquement si laissé vide." },
        },
        { name: "firstName", type: "text", label: "Prénom", required: true, admin: { width: "33%" } },
        { name: "lastName", type: "text", label: "Nom", required: true, admin: { width: "33%" } },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "company",
          type: "text",
          label: "Société",
          required: true,
          admin: {
            width: "50%",
            description: "L'entité qui emploie ce salarié (un client peut regrouper plusieurs sociétés).",
          },
        },
        {
          name: "poste",
          type: "text",
          label: "Poste",
          admin: {
            width: "50%",
            placeholder: "Maçon, coffreur, grutier, conducteur de travaux…",
            description: "Le métier réel — à ne pas confondre avec la priorité (profil de licence).",
          },
        },
      ],
    },

    // ─── Accès TIM : ce qui déclenche (ou non) une licence ────────────────────
    {
      type: "row",
      fields: [
        {
          name: "isUser",
          type: "checkbox",
          label: "Accès TIM (consomme une licence)",
          defaultValue: false,
          admin: { width: "50%" },
        },
        {
          name: "licenceProfile",
          type: "select",
          label: "Priorité",
          options: LICENCE_PROFILE_OPTIONS,
          // Obligatoire dès qu'une licence est consommée : sans profil, la ligne
          // ne peut pas être chiffrée dans le devis.
          validate: (value: unknown, { siblingData }: { siblingData?: { isUser?: boolean } }) =>
            value || !siblingData?.isUser ? true : "Obligatoire pour un utilisateur.",
          admin: {
            width: "50%",
            condition: (_, sibling) => Boolean(sibling?.isUser),
            description: "Profil de licence — détermine le prix dans le devis.",
          },
        },
      ],
    },

    {
      type: "row",
      fields: [
        {
          name: "email",
          type: "email",
          label: "Adresse e-mail",
          // Obligatoire pour un utilisateur (c'est son identifiant de connexion),
          // facultative pour le reste de l'effectif : beaucoup de compagnons n'ont
          // pas d'adresse pro et reçoivent leurs accès en main propre.
          validate: validateEmail(
            (sibling) => Boolean(sibling?.isUser),
            "Obligatoire pour un utilisateur (c'est son identifiant de connexion).",
          ),
          admin: {
            width: "50%",
            description: "Requise pour les utilisateurs ; facultative pour les autres salariés.",
          },
        },
        {
          name: "phone",
          type: "text",
          label: "Téléphone",
          validate: validatePhone,
          admin: { width: "50%", placeholder: "+33 6 12 34 56 78" },
        },
      ],
    },
    { name: "address", type: "text", label: "Adresse" },
    {
      type: "row",
      fields: [
        {
          name: "nationality",
          type: "select",
          label: "Nationalité",
          options: [...COUNTRIES],
          admin: { width: "50%" },
        },
        {
          name: "birthDate",
          type: "date",
          label: "Date de naissance",
          validate: (value: unknown) => {
            if (!value) return true;
            const d = new Date(value as string);
            if (Number.isNaN(d.getTime())) return "Date invalide.";
            // Garde-fou de saisie (âge légal de travail) plutôt que contrôle RH :
            // attrape surtout les années mal tapées (2 025 au lieu de 1 025…).
            const age = (Date.now() - d.getTime()) / 31_557_600_000;
            if (age < 16) return "Le salarié doit avoir au moins 16 ans.";
            if (age > 90) return "Date de naissance improbable — vérifiez l'année.";
            return true;
          },
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "contractType",
          type: "select",
          label: "Type de contrat",
          options: [...CONTRACT_TYPES],
          admin: { width: "50%" },
        },
        {
          name: "contractEndDate",
          type: "date",
          label: "Date de fin de contrat",
          // « sauf CDI », exactement comme l'intitulé du fichier client.
          required: false,
          validate: (value: unknown, { siblingData }: { siblingData?: { contractType?: string } }) => {
            if (!value && CONTRACT_NEEDS_END_DATE(siblingData?.contractType)) {
              return "Obligatoire pour tout contrat autre qu'un CDI.";
            }
            return true;
          },
          admin: {
            width: "50%",
            condition: (_, sibling) => CONTRACT_NEEDS_END_DATE(sibling?.contractType),
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
          },
        },
      ],
    },

    partnerField,
    displayNameField,
  ],
};
