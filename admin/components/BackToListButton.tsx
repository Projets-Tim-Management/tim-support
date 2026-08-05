"use client";

import { getTranslation } from "@payloadcms/translations";
import { useConfig, useDocumentInfo, useEntityVisibility, useTranslation } from "@payloadcms/ui";
import { useRouter } from "next/navigation";

/**
 * Bouton « ← <Liste> » ajouté aux contrôles de TOUTES les fiches
 * (`beforeDocumentControls`, injecté collection par collection dans
 * payload.config.ts) : depuis une fiche ouverte en plein écran, revenir à sa
 * liste sans passer par le bouton « précédent » du navigateur.
 *
 * La collection et son libellé sont déduits du contexte : un seul composant pour
 * toutes les fiches, aucun paramétrage à maintenir. Positionné tout à gauche de
 * la ligne « Dernière modification / Créé » (CSS `.tim-back-btn`, _partners.scss).
 */
export function BackToListButton() {
  const { collectionSlug } = useDocumentInfo();
  const { config, getEntityConfig } = useConfig();
  const { isEntityVisible } = useEntityVisibility();
  const { i18n } = useTranslation();
  const router = useRouter();

  if (!collectionSlug) return null;
  // Collection masquée pour ce rôle (ex. « Partenaires » vu par un partenaire, qui
  // n'accède qu'à SA fiche) : pas de retour vers une liste qu'il n'a pas.
  if (!isEntityVisible({ collectionSlug })) return null;

  const entity = getEntityConfig({ collectionSlug });
  const label = entity?.labels?.plural
    ? getTranslation(entity.labels.plural, i18n)
    : collectionSlug;

  return (
    <button
      type="button"
      className="tim-back-btn"
      onClick={() => router.push(`${config.routes.admin}/collections/${collectionSlug}`)}
    >
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3 5 8l5 5" />
      </svg>
      {label}
    </button>
  );
}
