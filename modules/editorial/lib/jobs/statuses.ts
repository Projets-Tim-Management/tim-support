/** Statuts d'une fiche métier (étape 9) : options du champ, étiquette de couleur du tableau. */
export const JOB_STATUSES = [
  { value: "a-rediger", label: "À rédiger", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)", hint: "Métier décidé par l'équipe : la fiche part en rédaction." },
  { value: "redaction", label: "En rédaction", color: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)", hint: "Chiffres France Travail lus, rédaction et contrôle en cours." },
  { value: "a-verifier", label: "À vérifier", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", hint: "Le contrôle a bloqué la fiche : voir le motif." },
  { value: "publiee", label: "Publiée", color: "var(--tim-green)", bg: "var(--tim-green-bg)", hint: "En ligne sur tim-management.co." },
  { value: "arretee", label: "Arrêtée", color: "var(--tim-red)", bg: "var(--tim-red-bg)", hint: "Métier écarté : il ne sera plus proposé." },
] as const;
