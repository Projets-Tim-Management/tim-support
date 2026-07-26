import Link from "next/link";
import type { ParcoursSummary } from "@/core/lib/types";
import ParcoursProgressBadge from "./ParcoursProgressBadge";
import ParcoursNumberPastille from "./ParcoursNumberPastille";

interface Props {
  parcours: ParcoursSummary;
  /** Position dans le groupe — affichée en pastille "Parcours N" à gauche. */
  index?:   number;
}

/**
 * Carte "ligne" horizontale, occupe toute la largeur du conteneur.
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [Parcours 1]  Titre du parcours              [Badge] 8 ét. → │
 *   │               Description courte…                              │
 *   └──────────────────────────────────────────────────────────────┘
 */
export default function ParcoursCard({ parcours, index }: Props) {
  return (
    <Link
      href={`/parcours/${parcours.slug}`}
      className="group flex items-center gap-5 p-5 rounded-lg border border-border bg-white hover:border-foreground hover:shadow-md transition-all"
    >
      {/* Numéro du parcours — cercle qui passe au vert quand le parcours est terminé */}
      {index ? (
        <ParcoursNumberPastille
          slug={parcours.slug}
          totalSteps={parcours.step_count}
          index={index}
        />
      ) : (
        <span className="shrink-0 w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center text-2xl" aria-hidden>
          🎓
        </span>
      )}

      {/* Bloc central : titre + intro */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-foreground leading-tight">
          {parcours.title}
        </h3>
        {parcours.intro && (
          <p className="text-sm text-muted mt-1 leading-relaxed line-clamp-2">
            {parcours.intro}
          </p>
        )}
      </div>

      {/* Bloc droite : badge progression + nb étapes + chevron */}
      <div className="shrink-0 flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end gap-1.5">
          <ParcoursProgressBadge slug={parcours.slug} totalSteps={parcours.step_count} />
          <p className="text-xs text-muted whitespace-nowrap">
            {parcours.step_count} étape{parcours.step_count > 1 ? "s" : ""}
          </p>
        </div>
        <svg className="w-5 h-5 text-muted group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
