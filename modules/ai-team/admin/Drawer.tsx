"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * La fiche d'un agent, dans un panneau qui glisse depuis la droite par-dessus
 * l'organigramme (décision du 12/11/2026). L'agent ouvert reste dans l'adresse
 * (?membre=…) : un lien partagé, un rechargement ou une demande qui pointe
 * vers sa carte rouvrent le même panneau. On ferme avec ✕, Échap ou un clic à
 * côté — l'adresse revient à l'organigramme.
 *
 * Rendu à la racine du document (portail) : dans la page, un conteneur de
 * l'admin l'enfermait sous la navigation et l'en-tête de Payload.
 */
const noop = () => () => {};
export function Drawer({ label, closeHref, onClose, narrow = false, children }: { label: string; closeHref?: string; onClose?: () => void; narrow?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  // Côté serveur, pas de document : le panneau apparaît une fois la page hydratée.
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  // Fermer : revenir à l'adresse donnée (fiche d'agent), ou prévenir l'écran qui l'a ouvert (tâche de la feuille de route).
  const close = useCallback(() => (onClose ? onClose() : router.push(closeHref ?? "", { scroll: false })), [router, closeHref, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Échap dans un champ (cible, budget, message) annule la saisie, pas la fiche.
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) close();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [close]);
  if (!onClient) return null;
  return createPortal(
    <div className="ait-drawer" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="ait-drawer__overlay" aria-label="Fermer la fiche" onClick={close} />
      <aside className={`ait-drawer__panel${narrow ? " ait-drawer__panel--narrow" : ""}`}>
        <button type="button" className="ait-drawer__close" aria-label="Fermer la fiche" onClick={close}>
          ✕
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  );
}
