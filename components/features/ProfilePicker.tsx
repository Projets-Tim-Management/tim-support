"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FEATURE_PROFILES } from "@/modules/editorial/lib/feature-profiles";

/**
 * « Je suis… » au-dessus de la liste des fonctionnalités : un compagnon ne voit
 * plus les fiches des conducteurs de travaux, et inversement. Les fiches sans
 * profil coché concernent tout le monde et restent toujours visibles.
 *
 * Le choix vit dans l'adresse (`?profil=compagnon`) — une liste filtrée se
 * partage d'un lien — et est retenu par le navigateur pour la recherche (voir
 * SearchModal, même clé).
 */
export const PROFILE_STORAGE_KEY = "tim-support:profil";

export default function ProfilePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("profil") ?? "";

  const pick = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("profil", value);
    else next.delete("profil");
    try {
      if (value) localStorage.setItem(PROFILE_STORAGE_KEY, value);
      else localStorage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
      /* stockage indisponible : le filtre marche quand même, sans mémoire */
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const chip = (active: boolean) =>
    `shrink-0 px-3 py-1.5 rounded-[5px] text-sm border transition-all ${
      active
        ? "border-primary bg-primary-light text-primary font-medium"
        : "border-border bg-white text-foreground hover:bg-surface"
    }`;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="group" aria-label="Filtrer par profil">
      <span className="shrink-0 text-xs font-semibold text-muted uppercase tracking-wider mr-1">Je suis</span>
      <button type="button" className={chip(!current)} aria-pressed={!current} onClick={() => pick("")}>
        Tous les profils
      </button>
      {FEATURE_PROFILES.map((p) => (
        <button
          key={p.value}
          type="button"
          className={chip(current === p.value)}
          aria-pressed={current === p.value}
          onClick={() => pick(p.value)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
