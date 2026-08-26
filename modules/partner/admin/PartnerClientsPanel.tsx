"use client";

import { useAuth, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { hasAdminRole } from "@/core/access";
import { eur, round2 } from "@/modules/partner/lib/format";
import { isBillableClient } from "@/modules/partner/lib/pricing";

/**
 * Synthèse « commission » de la fiche partenaire : tuiles calculées en direct
 * (CA payé × taux du partenaire, sur les clients ACTIFS uniquement — la
 * commission s'interrompt à la résiliation, cf. PDF).
 *
 * La LISTE et l'AJOUT/ÉDITION des clients se font juste en dessous via le champ
 * `join` natif (drawer/modal, sans changement de page).
 */

type Client = { caPaye?: number; clientStatus?: string; contractStartDate?: string | null };

export function PartnerClientsPanel() {
  const { id } = useDocumentInfo();
  const { user } = useAuth();
  // Le partenaire VOIT son taux (lecture ouverte, écriture admin) : la tuile est
  // donc juste pour lui aussi. Seul le renvoi vers l'onglet d'édition est admin.
  const isAdmin = hasAdminRole(user);
  const rate = useFormFields(([fields]) => Number(fields?.commissionRate?.value ?? 0));

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/payload-api/partner-clients?where[partner][equals]=${id}&limit=500&depth=0`,
          { credentials: "include" },
        );
        const data = res.ok ? await res.json() : { docs: [] };
        if (!cancelled) setClients((data?.docs ?? []) as Client[]);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="partner-activity">
        <p className="partner-activity__empty">Enregistrez le partenaire pour suivre ses clients.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="partner-activity">
        <p className="partner-activity__empty">Chargement…</p>
      </div>
    );
  }

  // Seules les affaires gagnées AU CONTRAT COMMENCÉ comptent (voir
  // isBillableClient) : un lead du pipeline a déjà des licences saisies mais ne
  // paie pas encore, et un contrat signé pour le mois prochain non plus.
  const actifs = clients.filter((c) => isBillableClient(c));
  const caActif = actifs.reduce((s, c) => s + (c.caPaye ?? 0), 0);
  const commissionMensuelle = round2((caActif * rate) / 100);

  return (
    <div className="partner-activity">
      <div className="pa-stats">
        <div className="pa-stat">
          <span className="pa-stat__label">Clients actifs</span>
          <span className="pa-stat__value">
            {actifs.length}
            {clients.length > actifs.length && (
              // « autres » et non « résiliés » : le reste mêle prospects, clients
              // en cours, résiliés et archivés — tous hors facturation.
              <span className="pa-stat__sub"> · {clients.length - actifs.length} autre(s)</span>
            )}
          </span>
        </div>
        <div className="pa-stat">
          <span className="pa-stat__label">CA payé HT / mois</span>
          <span className="pa-stat__value">{eur.format(caActif)}</span>
        </div>
        <div className="pa-stat pa-stat--strong">
          <span className="pa-stat__label">Commission / mois ({rate || 0} %)</span>
          <span className="pa-stat__value">{eur.format(commissionMensuelle)}</span>
        </div>
      </div>

      {rate === 0 && (
        <p className="partner-activity__hint">
          Aucun taux de commission défini{isAdmin && " (onglet « Contrat & programme »)"} →
          commission affichée à 0.
        </p>
      )}
    </div>
  );
}
