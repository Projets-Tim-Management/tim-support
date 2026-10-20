"use client";

import { useConfig } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { draftFromDoc, isComplete } from "@/modules/ads/lib/campaign-wizard";

import { CampaignWizard } from "./CampaignWizard";

/**
 * En tête de la liste des campagnes : « Nouvelle campagne » ouvre la fenêtre pas
 * à pas (le bouton « Créer » de Payload est masqué pour cette liste), et les
 * brouillons commencés mais incomplets se reprennent d'un clic.
 */
export function CampaignWizardLauncher() {
  const [open, setOpen] = useState<{ id: number | string | null } | null>(null);
  const rest = useConfig().config.routes.api;
  const [unfinished, setUnfinished] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetch(`${rest}/ad-campaigns?limit=50&depth=0&where[status][equals]=brouillon&where[externalId][exists]=false&sort=-updatedAt`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d: { docs: (Record<string, unknown> & { id: number; name: string })[] }) => setUnfinished(d.docs.filter((c) => !isComplete(draftFromDoc(c as never))).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => null);
  }, [open, rest]);

  return (
    <div className="ads-wiz-launcher">
      <button type="button" className="tim-btn tim-btn--primary" onClick={() => setOpen({ id: null })}>
        + Nouvelle campagne
      </button>
      {unfinished.length > 0 && (
        <p className="ads-wiz-launcher__resume">
          À terminer :{" "}
          {unfinished.map((c, i) => (
            <span key={c.id}>
              {i ? ", " : ""}
              <button type="button" onClick={() => setOpen({ id: c.id })}>
                {c.name}
              </button>
            </span>
          ))}
        </p>
      )}
      {open && <CampaignWizard campaignId={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default CampaignWizardLauncher;
