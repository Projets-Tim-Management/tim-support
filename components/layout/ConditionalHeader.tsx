"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";

/**
 * Masque la navigation du site sur TOUT l'espace client.
 *
 * L'espace client n'est pas une section du centre d'aide, c'est un autre lieu :
 * le client y vient faire une chose précise — réserver sa session, remplir son
 * dossier, récupérer ses accès. La recherche, les nouveautés et les parcours du
 * site ne l'y aident pas, et une barre pleine de sorties invite surtout à
 * partir. L'espace porte sa propre navigation : le logo de l'en-tête, les liens
 * « ← Mon espace » et la déconnexion.
 *
 * Même principe que ConditionalFooter, et volontairement au même endroit : les
 * deux règles d'affichage du châssis se lisent côte à côte.
 */
export default function ConditionalHeader() {
  const pathname = usePathname();
  // La connexion ET toutes les pages internes (/accueil, /dossier, /acces…).
  const isPortal = /^\/espace-client(?:\/|$)/.test(pathname);
  if (isPortal) return null;
  return <Header />;
}
