"use client";

import { toast, useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

type Estimate = {
  missing: string[];
  facts: number;
  maxCostEur: number;
  budget: { ok: true; remainingDay: number | null; remainingMonth: number } | { ok: false; reason: string };
  quota: { used: number; limit: number; planned: number };
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * « Générer des créas », en tête du brief.
 *
 * Tout ce qui peut empêcher la génération se voit AVANT de cliquer : ce qui
 * manque au brief, le coût maximal, ce qui reste du budget, le quota de la
 * semaine. Le bouton n'est actif que si tout passe — un clic qui échoue sur une
 * condition connue d'avance est un clic de trop.
 */
export function GenerateCreatives() {
  const { id } = useDocumentInfo();
  const [angles, setAngles] = useState<1 | 2 | 3>(3);
  const [toneTest, setToneTest] = useState(false);
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; rejected: number; costEur: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/ads/campaigns/${encodeURIComponent(String(id))}/generate?angles=${angles}&toneTest=${toneTest ? 1 : 0}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setEst)
      .catch(() => setEst(null));
  }, [id, angles, toneTest, done]);

  if (!id) {
    return <p className="ads-gen ads-gen--muted">Enregistrez la campagne pour pouvoir générer ses créas.</p>;
  }

  const quotaOk = est ? est.quota.used + est.quota.planned <= est.quota.limit : false;
  const ready = Boolean(est && !est.missing.length && est.budget.ok && quotaOk);

  const generate = async () => {
    setBusy(true);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/ads/campaigns/${encodeURIComponent(String(id))}/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angles, toneTest }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: unknown[]; texts?: { rejected: number }; costEur?: number };
      if (!res.ok) throw new Error(data.error || String(res.status));
      setDone({ created: data.created?.length ?? 0, rejected: data.texts?.rejected ?? 0, costEur: data.costEur ?? 0 });
      toast.success(`${data.created?.length ?? 0} créa(s) générée(s).`);
    } catch (e) {
      toast.error((e as Error).message || "Génération impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ads-gen">
      <div className="ads-gen__head">
        <strong>Générer des créas</strong>
        <span>Claude écrit les textes à partir de ce brief ; les garde-fous les contrôlent ; vous validez.</span>
      </div>
      <div className="ads-gen__controls">
        <label className="ads-gen__field">
          Angles
          <select value={angles} onChange={(e) => setAngles(Number(e.target.value) as 1 | 2 | 3)} disabled={busy}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label className="ads-gen__check">
          <input type="checkbox" checked={toneTest} onChange={(e) => setToneTest(e.target.checked)} disabled={busy} />
          Ajouter un test de ton (le premier angle, en tutoiement)
        </label>
        <button type="button" className="tim-btn tim-btn--primary" disabled={!ready || busy} onClick={generate}>
          {busy ? "Génération… (jusqu'à une minute)" : "Générer"}
        </button>
      </div>
      {est && (
        <ul className="ads-gen__facts">
          {est.missing.length > 0 && <li className="ads-gen__bad">Il manque au brief : {est.missing.join(", ")}.</li>}
          {est.facts === 0 && <li className="ads-gen__warn">Aucune preuve choisie : les textes ne pourront citer aucun chiffre hors de l&apos;offre.</li>}
          <li>
            Coût maximal : <strong>{eur(est.maxCostEur)}</strong>
            {est.budget.ok
              ? ` — il reste ${est.budget.remainingDay != null ? `${eur(est.budget.remainingDay)} aujourd'hui, ` : ""}${eur(est.budget.remainingMonth)} ce mois-ci.`
              : ""}
          </li>
          {!est.budget.ok && <li className="ads-gen__bad">{est.budget.reason}</li>}
          <li className={quotaOk ? undefined : "ads-gen__bad"}>
            Créas cette semaine : {est.quota.used} sur {est.quota.limit}
            {quotaOk ? `, cette génération en ajoutera ${est.quota.planned}.` : ` — cette génération en ajouterait ${est.quota.planned}, au-delà du quota.`}
          </li>
        </ul>
      )}
      {done && (
        <p className="ads-gen__done">
          {done.created} créa(s) créée(s), {eur(done.costEur)}.{done.rejected ? ` ${done.rejected} texte(s) rejeté(s) par les garde-fous, visibles sur chaque créa.` : ""}{" "}
          <a href={`/admin/collections/ad-creatives?where[campaign][equals]=${encodeURIComponent(String(id))}`}>Voir les créas</a>
        </p>
      )}
    </section>
  );
}
