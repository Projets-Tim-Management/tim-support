"use client";

import { useState } from "react";

import CampaignsTable from "@/modules/marketing/admin/CampaignsTable";
import MassEmailForm from "@/modules/marketing/admin/MassEmailForm";
import type { MassEmailTemplate } from "@/modules/marketing/lib/mass-email";
import type { DirectoryEntry, MassSender } from "@/modules/marketing/lib/mass-email-server";

/**
 * Écran « E-mail de masse » : deux onglets, écrire et mesurer.
 *
 * Le formulaire reste MONTÉ quand on regarde les campagnes (simplement masqué) :
 * passer voir les chiffres en cours de rédaction ne doit rien effacer.
 */
export default function MassEmailScreen(props: {
  initialTemplates: MassEmailTemplate[];
  directory: DirectoryEntry[];
  senders: MassSender[];
  defaultSender: string | null;
  hasSignature: boolean;
}) {
  const [tab, setTab] = useState<"envoi" | "campagnes">("envoi");
  // Incrémenté après chaque envoi : l'onglet des campagnes se recharge.
  const [refresh, setRefresh] = useState(0);

  return (
    <div>
      <div className="mass-mail__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "envoi"} onClick={() => setTab("envoi")}>
          Nouvel envoi
        </button>
        <button type="button" role="tab" aria-selected={tab === "campagnes"} onClick={() => setTab("campagnes")}>
          Campagnes envoyées
        </button>
      </div>

      <div hidden={tab !== "envoi"}>
        <MassEmailForm
          {...props}
          onSent={() => setRefresh((n) => n + 1)}
          onShowCampaigns={() => setTab("campagnes")}
        />
      </div>
      {tab === "campagnes" && <CampaignsTable refreshKey={refresh} />}
    </div>
  );
}
