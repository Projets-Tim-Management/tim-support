"use client";

import { useAuth } from "@payloadcms/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { isPartnerMetier } from "@/core/access";

/**
 * Partenaire-MÉTIER, list view de `partners`. Deux effets, aucun rendu visible
 * (branché en `admin.components.beforeListTable`) :
 *
 *  1. Retire les contrôles (recherche, filtres, sélecteur de colonnes, tri) via
 *     une classe posée sur <body> qui pilote le CSS (`.tim-partners-list-lite`,
 *     voir styles/admin/_partners.scss). Le métier ne voit que SA fiche
 *     (row-level `ownPartnerRecord`) → chercher/filtrer n'a aucun intérêt.
 *
 *  2. FORCE l'ordre des colonnes (Avatar, Nom, Prénom, Société, Email). On ne peut
 *     pas se reposer sur `admin.defaultColumns` : Payload le contourne dès qu'une
 *     PRÉFÉRENCE de colonnes est enregistrée pour l'utilisateur (table
 *     `payload_preferences`), et le client en recrée une à chaque visite. Le
 *     paramètre d'URL `columns` (JSON, format natif Payload) PRIME sur la
 *     préférence (voir @payloadcms/next List view). On le force ici → ordre
 *     déterministe pour tous les métiers, sans purge de BDD. Le sélecteur étant
 *     masqué (effet 1), ce forçage n'entre jamais en conflit avec une action.
 *
 * Autres rôles (admin) : le composant ne fait rien → tableau + contrôles natifs.
 */

/** Colonnes actives voulues, dans l'ordre (accessors des champs de `partners`). */
const DESIRED_COLUMNS = ["avatar", "name", "firstName", "societe", "email"];

export default function PartnersListLite() {
  const { user } = useAuth();
  const metier = isPartnerMetier(user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Effet 1 — mode « allégé » (masquage des contrôles) via classe body.
  useEffect(() => {
    if (!metier) return;
    document.body.classList.add("tim-partners-list-lite");
    return () => document.body.classList.remove("tim-partners-list-lite");
  }, [metier]);

  // Effet 2 — forçage de l'ordre des colonnes via l'URL (bat la préférence).
  useEffect(() => {
    if (!metier) return;

    // Colonnes ACTIVES actuellement dans l'URL, dans l'ordre. Payload stocke
    // `columns` comme un JSON de chaînes ; les colonnes masquées sont préfixées
    // d'un « - ». On ne compare que les actives → stable même si Payload ré-écrit
    // ensuite l'URL avec toutes les colonnes inactives ajoutées à la suite.
    const current = searchParams.get("columns");
    if (current) {
      try {
        const arr = JSON.parse(current) as unknown[];
        const active = arr.filter(
          (c): c is string => typeof c === "string" && !c.startsWith("-"),
        );
        const alreadyOrdered =
          active.length === DESIRED_COLUMNS.length &&
          DESIRED_COLUMNS.every((c, i) => active[i] === c);
        if (alreadyOrdered) return; // rien à faire → pas de boucle
      } catch {
        /* JSON invalide → on force ci-dessous */
      }
    }

    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("columns", JSON.stringify(DESIRED_COLUMNS));
    router.replace(`${pathname}?${params.toString()}`);
  }, [metier, searchParams, pathname, router]);

  return null;
}
