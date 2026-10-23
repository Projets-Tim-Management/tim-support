"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";

/**
 * Masque le footer pendant les étapes d'un parcours (/parcours/{slug}),
 * pour ne pas distraire l'utilisateur en mode tuto et libérer de l'espace
 * sous le contenu. Le footer reste visible sur /parcours (liste) et partout
 * ailleurs sur le site.
 */
export default function ConditionalFooter() {
  const pathname       = usePathname();
  const isParcoursStep = /^\/parcours\/[^/]+/.test(pathname);
  // Présentation de la V2 : page autonome, son propre pied (voir ConditionalHeader).
  const isPresentation = pathname.startsWith("/app-mobile-v2");
  if (isParcoursStep || isPresentation) return null;
  return <Footer />;
}
