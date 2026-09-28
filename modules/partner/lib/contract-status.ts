/**
 * Les statuts d'un contrat client (collection `client-contracts`) — module PUR,
 * sans Payload : lu par la collection, les routes, l'admin et les tests.
 */
export const CONTRACT_STATUSES = [
  { label: "Brouillon", value: "brouillon" },
  { label: "Envoyé au client", value: "envoye" },
  { label: "Signé par le client", value: "signe-client" },
  { label: "Signé", value: "signe" },
  { label: "Remplacé", value: "remplace" },
  { label: "Annulé", value: "annule" },
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number]["value"];

/** Un contrat « ouvert » : il bloque la création d'une nouvelle version. */
export const OPEN_CONTRACT_STATUSES = ["brouillon", "envoye", "signe-client"] as const satisfies readonly ContractStatus[];

/** Un contrat qui porte au moins la signature du client. */
export const SIGNED_CONTRACT_STATUSES = ["signe-client", "signe"] as const satisfies readonly ContractStatus[];
