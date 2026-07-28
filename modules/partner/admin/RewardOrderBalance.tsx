"use client";

import { useField, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { fieldRelId, nf } from "@/modules/partner/lib/format";

/**
 * Récap live d'une commande de récompense : dès que le partenaire ET la
 * récompense sont sélectionnés, affiche le coût (points), le solde du partenaire
 * et le solde après échange (différence), avec alerte si points insuffisants.
 */

export function RewardOrderBalance() {
  const { partnerId, rewardId } = useFormFields(([fields]) => ({
    partnerId: fieldRelId(fields?.partner?.value),
    rewardId: fieldRelId(fields?.reward?.value),
  }));

  const [cost, setCost] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  // Champ « Coût (points) » du formulaire : on l'écrit en direct.
  const costField = useField<number>({ path: "cost" });
  const setCostFieldValue = costField.setValue;

  useEffect(() => {
    if (rewardId == null) {
      setCost(null);
      return;
    }
    let cancelled = false;
    fetch(`/payload-api/rewards/${rewardId}?depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const c = typeof d?.cost === "number" ? d.cost : null;
        setCost(c);
        if (c != null) setCostFieldValue(c); // remplit « Coût (points) » en direct
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rewardId, setCostFieldValue]);

  useEffect(() => {
    if (partnerId == null) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    fetch(`/payload-api/point-transactions?where[partner][equals]=${partnerId}&limit=10000&depth=0`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => {
        if (!cancelled) {
          const total = (d?.docs ?? []).reduce(
            (s: number, t: { delta?: number }) => s + (t.delta ?? 0),
            0,
          );
          setBalance(total);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  if (partnerId == null || rewardId == null) {
    return (
      <div className="ro-balance ro-balance--empty">
        Sélectionnez un partenaire et une récompense pour voir le solde et la différence.
      </div>
    );
  }

  const diff = balance != null && cost != null ? balance - cost : null;
  const insufficient = diff != null && diff < 0;

  return (
    <div className={`ro-balance${insufficient ? " ro-balance--ko" : ""}`}>
      <div className="ro-balance__row">
        <span className="ro-balance__k">Coût de la récompense</span>
        <span className="ro-balance__v">{cost != null ? `${nf.format(cost)} pts` : "—"}</span>
      </div>
      <div className="ro-balance__row">
        <span className="ro-balance__k">Solde du partenaire</span>
        <span className="ro-balance__v">{balance != null ? `${nf.format(balance)} pts` : "—"}</span>
      </div>
      <div className="ro-balance__row ro-balance__row--diff">
        <span className="ro-balance__k">Solde après échange</span>
        <span className="ro-balance__v">{diff != null ? `${nf.format(diff)} pts` : "—"}</span>
      </div>
      {insufficient && (
        <p className="ro-balance__warn">
          ⚠️ Points insuffisants — il manque {nf.format(Math.abs(diff as number))} pts.
        </p>
      )}
    </div>
  );
}
