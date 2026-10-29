import { FEATURE_PROFILES, profileLabel } from "@/modules/editorial/lib/feature-profiles";

/**
 * « Rôles concernés : » — une pastille de couleur par rôle.
 *
 * Les couleurs sont celles de la page App mobile V2 (Compagnon visuel en
 * orange, Compagnon en bleu, Chef de chantier en vert, Conducteur de travaux
 * en violet) : un même rôle garde la même couleur d'une page à l'autre, et se
 * reconnaît avant d'être lu. Chef d'équipe et Bureau, absents de la V2, ont les
 * leurs.
 *
 * Rien quand aucun rôle n'est coché : la fiche concerne tout le monde, inutile
 * de le dire.
 */
const TONE: Record<string, string> = {
  conducteur: "bg-unavailable-bg text-unavailable",
  chefChantier: "bg-success-bg text-success-text",
  chefEquipe: "bg-primary-light text-primary",
  compagnon: "bg-absence-bg text-absence",
  visuel: "bg-processing-bg text-processing-text",
  bureau: "bg-surface text-chip-text ring-1 ring-border",
};

const pill = "rounded-[5px] px-2 py-0.5 text-xs font-semibold";

/** La couleur PLEINE de chaque rôle, pour les points des cartes. */
const DOT: Record<string, string> = {
  conducteur: "bg-unavailable",
  chefChantier: "bg-success",
  chefEquipe: "bg-primary",
  compagnon: "bg-absence",
  visuel: "bg-processing",
  bureau: "bg-chip-text",
};

export default function ProfileBadges({
  profiles,
  className = "",
  variant = "labels",
}: {
  profiles: string[];
  className?: string;
  /**
   * `labels` : les rôles en toutes lettres (page d'une fiche).
   * `dots` : des points de couleur qui se chevauchent, le nom au survol — sur
   * une carte, cinq pastilles colorées faisaient plus de bruit que le titre.
   */
  variant?: "labels" | "dots";
}) {
  if (!profiles?.length) return null;
  const all = FEATURE_PROFILES.every((p) => profiles.includes(p.value));
  // Toujours dans l'ordre de la liste : du conducteur au bureau, sur toutes les fiches.
  const ordered = FEATURE_PROFILES.map((p) => p.value as string).filter((v) => profiles.includes(v));

  if (variant === "dots") {
    const names = all ? "Tous les rôles" : ordered.map(profileLabel).join(", ");
    return (
      <span
        className={`group/roles relative inline-flex items-center ${className}`}
        aria-label={`Rôles concernés : ${names}`}
        role="img"
      >
        {ordered.map((p, i) => (
          <span
            key={p}
            className={`group/dot relative block h-3 w-3 rounded-full ring-2 ring-white ${DOT[p] ?? "bg-muted"} ${i ? "-ml-1" : ""}`}
          >
            {/* SOUS le point : la carte rogne ce qui dépasse (zoom de sa vignette),
                et les points sont tout en haut — une bulle au-dessus était coupée. */}
            <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover/dot:opacity-100">
              {profileLabel(p)}
            </span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-xs text-muted mr-0.5">Rôles concernés :</span>
      {all ? (
        <span className={`${pill} bg-surface text-foreground ring-1 ring-border`}>Tous les rôles</span>
      ) : (
        ordered.map((p) => (
          <span key={p} className={`${pill} ${TONE[p] ?? "bg-surface text-foreground"}`}>
            {profileLabel(p)}
          </span>
        ))
      )}
    </div>
  );
}
