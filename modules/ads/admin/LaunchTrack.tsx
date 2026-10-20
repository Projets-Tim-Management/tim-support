"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { LaunchStep } from "@/modules/ads/lib/launch-track";

import { CampaignWizard } from "./CampaignWizard";
import { LaunchTrackView } from "./LaunchTrackView";

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
    <>
      <LaunchTrackView steps={steps} onAct={act} />
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
    </>
  );
}

export default LaunchTrack;
