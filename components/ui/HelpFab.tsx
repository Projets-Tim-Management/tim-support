"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const ACTIONS = [
  { type: "assistance", icon: "💬", label: "Demander de l'aide",   color: "hover:bg-primary-light" },
  { type: "suggestion", icon: "💡", label: "Proposer une idée",    color: "hover:bg-success-bg" },
  { type: "autre",      icon: "✉️", label: "Autre demande",        color: "hover:bg-surface" },
] as const;

/**
 * Bouton flottant en bas à droite : un clic affiche les 3 types de demande,
 * chacun renvoie vers /contact?type=… avec le bon onglet pré-sélectionné.
 *
 * Masqué automatiquement sur /contact (inutile sur le formulaire lui-même).
 */
export default function HelpFab() {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ferme au clic à l'extérieur
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Ferme sur Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pas de FAB sur la page /contact (formulaire = redondant)
  if (pathname === "/contact") return null;

  function go(type: string) {
    setOpen(false);
    router.push(`/contact?type=${type}`);
  }

  return (
    // Masqué à l'impression : sur une feuille (accès, étiquettes, kit), le
    // bouton d'aide sortait en rond blanc dans le coin.
    <div ref={wrapperRef} className="fixed right-6 bottom-6 z-50 print:hidden">
      {/* Menu d'actions — apparaît au-dessus du bouton */}
      {open && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-2 items-end animate-in">
          {ACTIONS.map((a, i) => (
            <button
              key={a.type}
              onClick={() => go(a.type)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={`flex items-center gap-2.5 pl-4 pr-5 h-11 rounded-full bg-white border border-border shadow-md text-sm font-medium text-foreground whitespace-nowrap transition-all hover:shadow-lg hover:-translate-x-0.5 ${a.color} fab-item`}
            >
              <span className="text-lg" aria-hidden>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Bouton principal */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer le menu d'aide" : "Demander de l'aide"}
        aria-expanded={open}
        className={`w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center transition-all hover:bg-primary-dark hover:scale-105 active:scale-95 ${open ? "rotate-90" : ""}`}
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      <style jsx>{`
        .fab-item {
          opacity: 0;
          transform: translateY(8px);
          animation: fab-in 0.2s ease-out forwards;
        }
        @keyframes fab-in {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
