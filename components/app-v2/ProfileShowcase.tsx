"use client";

import { useState } from "react";

import Phone from "@/components/app-v2/Phone";
import type { AppV2Profile, AppV2Tone } from "@/modules/marketing/lib/app-v2";

/**
 * Ce qui change, profil par profil — l'écran du profil d'un côté, ses
 * changements de l'autre.
 *
 * Chaque profil porte la couleur de son étiquette dans la vidéo (jaune, bleu,
 * vert et violet) : le client relie d'un coup d'œil ce qu'il a vu et ce qu'il
 * lit. Les classes sont écrites en entier ci-dessous — Tailwind ne génère que
 * ce qu'il trouve tel quel dans le code.
 */

const TONES: Record<AppV2Tone, { chip: string; dot: string; tab: string; num: string; glow: string }> = {
  processing: {
    chip: "bg-processing-bg text-processing-text",
    dot: "bg-processing",
    tab: "border-processing bg-processing-bg",
    num: "bg-processing text-processing-text",
    glow: "bg-processing",
  },
  absence: {
    chip: "bg-absence-bg text-absence",
    dot: "bg-absence",
    tab: "border-absence bg-absence-bg",
    num: "bg-absence text-white",
    glow: "bg-absence",
  },
  success: {
    chip: "bg-success-bg text-success-text",
    dot: "bg-success",
    tab: "border-success bg-success-bg",
    num: "bg-success text-white",
    glow: "bg-success",
  },
  unavailable: {
    chip: "bg-unavailable-bg text-unavailable",
    dot: "bg-unavailable",
    tab: "border-unavailable bg-unavailable-bg",
    num: "bg-unavailable text-white",
    glow: "bg-unavailable",
  },
};

function RoleChips({ roles }: { roles: AppV2Profile["roles"] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <span key={r.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[r.tone].chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONES[r.tone].dot}`} />
          {r.label}
        </span>
      ))}
    </span>
  );
}

export default function ProfileShowcase({ profiles }: { profiles: AppV2Profile[] }) {
  const [active, setActive] = useState(profiles[0]?.id);
  const current = profiles.find((p) => p.id === active) ?? profiles[0];
  if (!current) return null;
  const tone = TONES[current.roles[0]?.tone ?? "absence"];

  return (
    <div>
      {/* Le sélecteur : un bouton par profil, à sa couleur une fois choisi. */}
      <div role="tablist" aria-label="Profils" className="grid gap-2 sm:grid-cols-3">
        {profiles.map((p) => {
          const selected = p.id === current.id;
          return (
            <button
              key={p.id}
              id={`onglet-${p.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`profil-${p.id}`}
              onClick={() => setActive(p.id)}
              className={`group rounded-2xl border-2 px-4 py-3.5 text-left transition duration-300 ${
                selected
                  ? `${TONES[p.roles[0].tone].tab} scale-[1.02] shadow-lg`
                  : "border-transparent bg-white hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              <RoleChips roles={p.roles} />
              <span className="mt-2 block text-xs text-chip-text">
                {p.changes.length} changement{p.changes.length > 1 ? "s" : ""}
                {p.changes.some((c) => c.nouveau) ? " · dont des nouveautés" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`profil-${current.id}`}
        role="tabpanel"
        aria-labelledby={`onglet-${current.id}`}
        className="mt-6 grid items-center gap-10 overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-foreground/5 sm:p-10 md:grid-cols-[minmax(0,300px)_1fr] md:gap-14"
      >
        {/* L'écran du profil, sur un halo à sa couleur. */}
        <div className="relative mx-auto w-[220px] sm:w-[260px]">
          <div aria-hidden="true" className={`absolute inset-[-25%] rounded-full opacity-25 blur-3xl transition-colors duration-700 ${tone.glow}`} />
          {/* `key` : changer de profil remonte le téléphone, il repart du premier écran. */}
          <Phone key={current.id} screens={current.screens} className="relative" />
        </div>

        <div key={current.id} className="v2-stagger">
          <RoleChips roles={current.roles} />
          <p className="mt-4 text-sm text-chip-text">{current.pourQui}</p>
          <p className="mt-1 text-2xl font-bold leading-snug text-ink sm:text-3xl">{current.intro}</p>
          <ol className="mt-8 space-y-5">
            {current.changes.map((c, i) => (
              <li key={c.titre} className="flex gap-4">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.num}`}>
                  {i + 1}
                </span>
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
                    {c.titre}
                    {c.nouveau && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Nouveau
                      </span>
                    )}
                  </p>
                  <p className="mt-1 leading-relaxed text-foreground/75">{c.texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
