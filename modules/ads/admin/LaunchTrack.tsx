"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { LaunchStep } from "@/modules/ads/lib/launch-track";

import { CampaignWizard } from "./CampaignWizard";

/**
 * En tête de la fiche campagne : le parcours jusqu'à la diffusion (lib/launch-track),
 * l'étape en cours mise en avant avec le bouton qui y mène — la fenêtre pas à
 * pas pour le brief, un onglet de la fiche, ou « À valider ». Relu au retour sur
 * l'onglet du navigateur : une créa validée ailleurs se voit ici.
 */
export function LaunchTrack() {
  const { id } = useDocumentInfo();
  const router = useRouter();
  const [steps, setSteps] = useState<LaunchStep[] | null>(null);
  const [wizard, setWizard] = useState(false);

  const load = useCallback(() => {
    if (id == null) return;
    fetch(`/api/admin/ads/campaigns/${encodeURIComponent(String(id))}/parcours`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { steps: LaunchStep[] } | null) => setSteps(d?.steps ?? null))
      .catch(() => null);
  }, [id]);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  if (id == null || !steps) return null;
  const current = steps.find((s) => s.current) ?? null;

  const act = (s: LaunchStep) => {
    if (!s.action) return;
    if (s.action.kind === "wizard") setWizard(true);
    else if (s.action.kind === "link") router.push(s.action.href);
    else {
      const label = s.action.tab;
      const tab = [...document.querySelectorAll<HTMLButtonElement>(".tabs-field__tab-button")].find((b) => b.textContent?.trim() === label);
      tab?.click();
      tab?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="ads-track" aria-label="Lancement de la campagne">
      <ol className="ads-track__steps">
        {steps.map((s, i) => (
          <li key={s.key} className={`ads-track__step${s.done ? " ads-track__step--done" : ""}${s.current ? " ads-track__step--current" : ""}`}>
            <span className="ads-track__dot" aria-hidden>
              {s.done ? "✓" : i + 1}
            </span>
            <span className="ads-track__label">{s.label}</span>
          </li>
        ))}
      </ol>
      {current ? (
        <div className="ads-track__next">
          <span>
            <strong>Prochaine étape : {current.label.toLowerCase()}.</strong> {current.detail}
          </span>
          {current.action && (
            <button type="button" className="tim-btn tim-btn--primary" onClick={() => act(current)}>
              {current.actionLabel} →
            </button>
          )}
        </div>
      ) : (
        <p className="ads-track__next ads-track__next--done">La campagne est en diffusion.</p>
      )}
      {wizard && (
        <CampaignWizard
          campaignId={id}
          onClose={() => {
            setWizard(false);
            load();
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

export default LaunchTrack;
