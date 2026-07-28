"use client";

import { useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { eur, fieldRelId, round2 } from "@/modules/partner/lib/format";
import { PROFILS } from "@/modules/partner/lib/pricing";

/**
 * Récap live de la barre latérale d'un client apporté : Total licences, CA HT,
 * remise volume conseillée, et surtout la COMMISSION DU PARTENAIRE
 * (= CA HT × son taux). Tout est calculé EN DIRECT depuis les champs du
 * formulaire → toujours cohérent avec le tableau, sans attendre l'enregistrement
 * (les mêmes valeurs sont stockées par le hook pour le reporting).
 */

export function PartnerCommissionBox() {
  const { totalQty, caHT, partnerId } = useFormFields(([fields]) => {
    let tQty = 0;
    let brut = 0;
    for (const pr of PROFILS) {
      const q = Number(fields[`licences.${pr.key}Qty`]?.value ?? 0);
      const p = Number(fields[`licences.${pr.key}Price`]?.value ?? 0);
      tQty += q;
      brut += q * p;
    }
    return { totalQty: tQty, caHT: round2(brut), partnerId: fieldRelId(fields.partner?.value) };
  });

  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (!partnerId) {
      setRate(null);
      return;
    }
    let cancelled = false;
    fetch(`/payload-api/partners/${partnerId}?depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setRate(typeof d?.commissionRate === "number" ? d.commissionRate : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const commission = rate != null ? round2((caHT * rate) / 100) : null;

  return (
    <div className="pc-summary">
      <div className="pc-row">
        <span className="pc-row__k">Total licences</span>
        <span className="pc-row__v">{totalQty}</span>
      </div>
      <div className="pc-row">
        <span className="pc-row__k">CA HT / mois</span>
        <span className="pc-row__v">{eur.format(caHT)}</span>
      </div>

      <div className="pcommission">
        <span className="pcommission__label">
          Commission partenaire{rate != null ? ` · ${rate} %` : ""}
        </span>
        <span className="pcommission__value">{commission != null ? eur.format(commission) : "—"}</span>
        <span className="pcommission__hint">
          {rate == null
            ? "Taux non défini (fiche partenaire → Contrat & programme)."
            : "= CA HT × taux du partenaire, par mois."}
        </span>
      </div>
    </div>
  );
}
