"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BillingCheckDetail, VerdictBadge } from "@/modules/partner/admin/BillingCheckTable";
import type { ClientCheck } from "@/modules/partner/lib/billing-check";
import { PROFILS } from "@/modules/partner/lib/pricing";

/**
 * Encart « Facturation Pennylane » sous le tableau des licences d'une fiche.
 *
 * Il compare ce qui est SAISI dans le formulaire — pas ce qui est enregistré —
 * à l'abonnement Pennylane : on corrige une quantité, l'écart se met à jour
 * sous les yeux, avant même d'enregistrer. La lecture Pennylane est en cache
 * une heure côté serveur ; « Actualiser » force une relecture.
 *
 * Aucune action ici : l'abonnement se modifie dans Pennylane, la fiche juste
 * au-dessus.
 */

type Result = { fetchedAt: string; check: ClientCheck | null };

const DEBOUNCE_MS = 500;

export function PennylaneCompare() {
  const { id } = useDocumentInfo();

  // Tout ce qui entre dans la comparaison, lu dans l'état du formulaire. Le
  // sélecteur renvoie une chaîne stable : l'effet ne repart que si ça change.
  const facts = useFormFields(([fields]) => {
    const licences: Record<string, number> = {};
    for (const p of PROFILS) {
      licences[`${p.key}Qty`] = Number(fields[`licences.${p.key}Qty`]?.value ?? 0);
      licences[`${p.key}Price`] = Number(fields[`licences.${p.key}Price`]?.value ?? 0);
      licences[`${p.key}DiscountPct`] = Number(fields[`licences.${p.key}DiscountPct`]?.value ?? 0);
      licences[`${p.key}DiscountAmount`] = Number(fields[`licences.${p.key}DiscountAmount`]?.value ?? 0);
    }
    return JSON.stringify({
      name: fields.companyName?.value ?? "",
      siren: fields.siren?.value ?? "",
      raisonSociale: fields.raisonSociale?.value ?? "",
      clientStatus: fields.clientStatus?.value ?? "",
      paymentMethod: fields.paymentMethod?.value ?? "",
      paymentTerms: fields.paymentTerms?.value ?? "",
      billingPeriod: fields.billingPeriod?.value ?? "",
      licences,
    });
  });

  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = (refresh = false) => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/pennylane/check${refresh ? "?refresh=1" : ""}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...JSON.parse(facts) }),
    })
      .then(async (r) => {
        const d = (await r.json().catch(() => null)) as (Result & { message?: string }) | null;
        if (!r.ok) throw new Error(d?.message || "Lecture Pennylane impossible.");
        setResult(d as Result);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(false), result ? DEBOUNCE_MS : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, facts]);

  if (!id) return null;

  const check = result?.check ?? null;
  const tone = error ? "none" : check ? check.verdict : "none";

  return (
    <div className={`bil-box bil-box--${tone}`}>
      <div className="bil-box__head">
        <span>Facturation Pennylane</span>
        {check && <VerdictBadge verdict={check.verdict} />}
        <span className="bil-box__spacer" />
        {loading && <span className="bil-box__hint">Lecture…</span>}
        <button type="button" className="bil-box__btn" onClick={() => run(true)} disabled={loading}>
          Actualiser
        </button>
        <Link href="/admin/facturation" prefetch={false} className="bil-box__link">
          Rapprochement complet
        </Link>
      </div>

      {error ? (
        <p className="bil-box__body">{error}</p>
      ) : !result ? (
        <p className="bil-box__body">Lecture de l&apos;abonnement Pennylane…</p>
      ) : !check ? (
        <p className="bil-box__body">
          Aucun abonnement Pennylane pour cette fiche — normal tant que l&apos;affaire n&apos;est pas gagnée.
        </p>
      ) : (
        <BillingCheckDetail check={check} />
      )}
    </div>
  );
}
