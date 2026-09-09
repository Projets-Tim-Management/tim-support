"use client";

import { useFormFields } from "@payloadcms/ui";

/**
 * « Ouvrir la fiche client » — dans un NOUVEL onglet, sous le champ Client.
 *
 * Pendant un parcours de test, on fait constamment l'aller-retour entre les
 * deux fiches : on lit une étape ici, on va vérifier un accès ou un chantier
 * là-bas, on revient valider. Le champ « Client » ci-dessus nomme l'entreprise
 * mais ne mène nulle part — il fallait passer par le menu et la liste, et au
 * retour la fiche du parcours était rechargée, onglet et défilement perdus.
 *
 * Un nouvel onglet plutôt qu'une navigation, justement pour ça : le parcours
 * reste ouvert derrière, tel qu'on l'avait laissé.
 *
 * Rien tant que le client n'est pas choisi : sur une création, le lien pointerait
 * vers une fiche qui n'existe pas.
 */

/** L'état du formulaire rend tantôt l'identifiant seul, tantôt le document. */
const idOf = (value: unknown): string | null => {
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "number" || typeof id === "string") return String(id);
  }
  return null;
};

export const OpenClientLink = () => {
  const clientId = useFormFields(([fields]) => idOf(fields.client?.value));
  if (!clientId) return null;

  return (
    <div className="field-type jr-openlink">
      <a
        href={`/admin/collections/partner-clients/${clientId}`}
        target="_blank"
        rel="noreferrer noopener"
        className="jr-openlink__a"
      >
        Ouvrir la fiche client
        {/* La flèche dit « ça part ailleurs » avant le clic — sans elle, un
            nouvel onglet qui s'ouvre passe pour une erreur. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </svg>
      </a>
    </div>
  );
};
