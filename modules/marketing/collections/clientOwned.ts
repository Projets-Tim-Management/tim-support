import type { CollectionBeforeChangeHook, Field } from "payload";

/**
 * Socle commun aux 4 sections du dossier de démarrage (salariés, chantiers,
 * véhicules, engins).
 *
 * Toutes suivent exactement le modèle de `client-contacts` : rattachées à un
 * client, scopées par `partner` (la clé tenant du RBAC), gérées depuis la fiche
 * client via un champ `join` — jamais dans le menu latéral. Factorisé ici parce
 * que répéter la même relation et le même hook quatre fois, c'est trois
 * occasions d'oublier l'anti-usurpation.
 */

/** Renseigne `partner` (clé de scoping) à partir du client rattaché — tous rôles. */
export const setPartnerFromClient: CollectionBeforeChangeHook = async ({ data, req }) => {
  const clientRef = data?.client;
  if (clientRef == null) return data;
  const clientId = typeof clientRef === "object" ? (clientRef as { id: unknown }).id : clientRef;
  try {
    const client = await req.payload.findByID({
      collection: "partner-clients",
      id: clientId as string | number,
      depth: 0,
      overrideAccess: true,
      // ⚠️ `req` transmis = MÊME transaction. Sans lui, la lecture se fait sur
      // une connexion à part : à la CRÉATION d'un client, sa ligne n'y est pas
      // encore visible, `partner` restait donc vide — et l'enregistrement
      // devenait invisible pour le partenaire propriétaire (scoping RBAC).
      req,
    });
    const p = (client as { partner?: unknown })?.partner;
    data.partner = p != null && typeof p === "object" ? (p as { id: unknown }).id : p;
  } catch {
    /* client introuvable → laissé tel quel (le `required` remontera l'erreur) */
  }
  return data;
};

/** Relation vers le client : imposée par le drawer du `join`, jamais modifiable. */
export const clientField: Field = {
  name: "client",
  type: "relationship",
  relationTo: "partner-clients",
  label: "Client",
  required: true,
  index: true,
  // Défini automatiquement par le drawer du champ `join` (contexte du client).
  admin: { readOnly: true },
};

/** Clé de scoping RBAC, dérivée du client et masquée du formulaire. */
export const partnerField: Field = {
  name: "partner",
  type: "relationship",
  relationTo: "partners",
  index: true,
  admin: { hidden: true },
};

/** Titre lisible du drawer, calculé (les collections n'ont pas de champ « titre »). */
export const displayNameField: Field = {
  name: "displayName",
  type: "text",
  admin: { hidden: true },
};

/** Année d'un véhicule / engin : bornée pour attraper les fautes de frappe. */
export const yearField = (label: string): Field => ({
  name: "year",
  type: "number",
  label,
  required: true,
  min: 1950,
  max: new Date().getFullYear() + 1,
  admin: { width: "25%", placeholder: String(new Date().getFullYear()) },
});

/**
 * Date de la carte grise (délivrance du certificat d'immatriculation).
 *
 * FACULTATIVE, comme l'échéance d'assurance : elle complète la fiche d'un
 * véhicule, elle ne conditionne pas son existence.
 */
export const registrationDateField: Field = {
  name: "registrationDate",
  type: "date",
  label: "Carte grise",
  admin: {
    width: "25%",
    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
    description: "Date du certificat d'immatriculation.",
  },
};

/** Échéance du contrôle technique. Facultative, même raison. */
export const inspectionDateField: Field = {
  name: "inspectionDate",
  type: "date",
  label: "Contrôle technique",
  admin: {
    width: "25%",
    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
    description: "Échéance du dernier contrôle.",
  },
};

/**
 * Date d'échéance d'assurance. Affichée telle quelle ; une échéance dépassée est
 * signalée à la lecture par la cellule dédiée (InsuranceCell).
 *
 * FACULTATIVE : le client ne l'a pas toujours sous la main au moment de saisir
 * son parc, et l'exiger bloquait l'enregistrement de la ligne entière — donc du
 * véhicule lui-même, qui est l'information utile. Elle se complète après coup.
 */
export const insuranceDateField: Field = {
  name: "insuranceDate",
  type: "date",
  label: "Date d'assurance",
  admin: {
    width: "25%",
    date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
    description: "Échéance du contrat.",
    components: { Cell: "/modules/marketing/admin/InsuranceCell#InsuranceCell" },
  },
};
