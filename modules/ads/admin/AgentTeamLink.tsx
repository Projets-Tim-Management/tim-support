"use client";

import { useAuth, useDocumentInfo } from "@payloadcms/ui";
import Link from "next/link";

import { isDirection } from "@/core/access";

/**
 * Ce qui reste des agents dans l'onglet « Agent » d'une campagne (décision du
 * 12/11/2026) : un renvoi. Les agents ont un nom, un visage et une page —
 * Équipe IA, réservée à la direction. On y lance la préparation, on y suit
 * les passages, on y questionne la cheffe.
 *
 * Les réglages de la campagne (autonomie, budget de l'agent) restent ici :
 * ce sont des paramètres de la campagne, pas le travail des agents.
 */
export function AgentTeamLink() {
  const { id } = useDocumentInfo();
  const { user } = useAuth();
  if (!id) return null;
  return (
    <div className="ads-agent-link">
      <strong>Préparation et suivi : l&apos;équipe IA</strong>
      {isDirection(user) ? (
        <span>
          Mark et son équipe préparent et suivent cette campagne.{" "}
          <Link href={`/admin/equipe-ia?membre=chef-sea&campagne=${encodeURIComponent(String(id))}`} prefetch={false}>
            Ouvrir dans Équipe IA →
          </Link>
        </span>
      ) : (
        <span>Le travail des agents se pilote depuis la page Équipe IA, réservée à la direction.</span>
      )}
    </div>
  );
}
