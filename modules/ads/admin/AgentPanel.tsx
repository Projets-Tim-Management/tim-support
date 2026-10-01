"use client";

import { toast, useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

type Preview = {
  lancable: boolean;
  blocages: string[];
  budget: { plafondDuPassageEur: number | null; preparationMaxEur: number; coutMaximalEur: number; agentsJour: { depense: number; plafond: number }; agentsMois: { depense: number; plafond: number } };
  lectures: {
    brief: { faits: number; interdits: number; anglesSouhaites: number };
    site: { pagesAuPlus: number; adresses: string[] };
    acquisition: { leadsParCanal: number; clientsSignes: number; manque: string[] };
    concurrents: { suivis: string[]; bibliotheque: string };
  };
  creasPossibles: number;
};
type Last = { id: number | string; statut: string; objectif: string; budgetEur: number; depenseEur: number; bilan: string | null; motif: string | null; enCours: boolean; fil: { ligne: string; le: string }[] } | null;

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const STATUS: Record<string, string> = { "en-cours": "En cours", "en-pause-budget": "En pause (plafond du jour)", "a-valider": "Terminé — à valider", arrete: "Arrêté", echoue: "Échoué" };

/**
 * L'agent de campagne, dans l'onglet « Agent » (plan, §9 quater).
 *
 * Avant le clic : ce que l'agent va lire et ce que le passage peut coûter AU
 * PLUS — le bouton n'est actif que si rien ne bloque. Pendant un passage : sa
 * dépense face à son budget, ses dernières actions, et « Arrêter », toujours à
 * portée. Les deux boutons sont les gestes eux-mêmes : pas de confirmation.
 */
export function AgentPanel() {
  const { id } = useDocumentInfo();
  const [objective, setObjective] = useState("");
  const [capEur, setCapEur] = useState("2");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [last, setLast] = useState<Last>(null);
  const [busy, setBusy] = useState(false);

  const base = id ? `/api/admin/ads/campaigns/${encodeURIComponent(String(id))}/agent` : null;
  // L'aperçu complet (lourd : CRM, site, plafonds) — au chargement et après une saisie du plafond, pas en boucle.
  const load = useCallback(() => {
    if (!base) return;
    fetch(`${base}?cap=${encodeURIComponent(capEur)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { preview: Preview; last: Last } | null) => {
        setPreview(d?.preview ?? null);
        setLast(d?.last ?? null);
      })
      .catch(() => null);
  }, [base, capEur]);

  useEffect(() => {
    const t = setTimeout(load, 500); // on attend la fin de la frappe dans le champ « plafond »
    return () => clearTimeout(t);
  }, [load]);
  // Pendant un passage : seulement son état, toutes les 5 secondes ; l'aperçu complet revient quand il se termine.
  useEffect(() => {
    if (!last?.enCours || !base) return;
    const t = setInterval(() => {
      fetch(`${base}?status=1`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { last: Last } | null) => {
          if (!d) return;
          setLast(d.last);
          if (!d.last?.enCours) load();
        })
        .catch(() => null);
    }, 5_000);
    return () => clearInterval(t);
  }, [last?.enCours, base, load]);

  if (!id) return <p className="ads-gen ads-gen--muted">Enregistrez la campagne pour pouvoir lancer l&apos;agent.</p>;

  const post = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(ok);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const running = Boolean(last?.enCours);
  const canLaunch = Boolean(preview?.lancable && objective.trim() && !busy && Number(capEur) > 0);

  return (
    <section className="ads-gen ads-agent">
      <div className="ads-gen__head">
        <strong>Agent de campagne</strong>
        <span>Il prépare positionnement, audiences, angles, textes et visuels, et dépose les créas « À valider ». Rien n&apos;est publié chez Meta.</span>
      </div>

      {running && last && (
        <div className="ads-agent__live">
          <div className="ads-agent__status">
            <span className="ads-badge ads-badge--test">{STATUS[last.statut] ?? last.statut}</span>
            <span>
              Dépensé <strong>{eur(last.depenseEur)}</strong> sur {eur(last.budgetEur)}
            </span>
            <button type="button" className="tim-btn ads-actions__danger" disabled={busy} onClick={() => post(`/api/admin/ads/agent-runs/${encodeURIComponent(String(last.id))}/stop`, {}, "Passage arrêté.")}>
              Arrêter
            </button>
          </div>
          <p className="ads-agent__objective">« {last.objectif} »</p>
          <ol className="ads-agent__feed">
            {last.fil.map((l, i) => (
              <li key={i}>
                <time>{new Date(l.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time> {l.ligne}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!running && (
        <>
          <label className="ads-agent__objective-field">
            Objectif de la campagne, en une phrase
            <textarea rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} disabled={busy} placeholder="Obtenir des démos auprès de gérants de PME du BTP de 11 à 50 salariés" />
          </label>
          <div className="ads-gen__controls">
            <label className="ads-gen__field">
              Plafond de ce passage (€)
              <input type="number" min="0.5" step="0.5" value={capEur} onChange={(e) => setCapEur(e.target.value)} disabled={busy} />
            </label>
            <button type="button" className="tim-btn tim-btn--primary" disabled={!canLaunch} onClick={() => post(base!, { objective, capEur: Number(capEur) }, "Agent lancé.")}>
              Lancer l&apos;agent
            </button>
          </div>
          {preview && (
            <ul className="ads-gen__facts">
              {preview.blocages.map((b) => (
                <li key={b} className="ads-gen__bad">
                  {b}
                </li>
              ))}
              <li>
                Coût maximal de ce passage : <strong>{eur(preview.budget.coutMaximalEur)}</strong> — aucun appel ne part au-delà. Agents aujourd&apos;hui : {eur(preview.budget.agentsJour.depense)} sur{" "}
                {eur(preview.budget.agentsJour.plafond)} ; ce mois : {eur(preview.budget.agentsMois.depense)} sur {eur(preview.budget.agentsMois.plafond)}.
              </li>
              <li>
                Il lira : le brief ({preview.lectures.brief.faits} fait(s) sourcé(s), {preview.lectures.brief.interdits} interdit(s)) ; ces {preview.lectures.site.adresses.length} pages du site :
                <ol className="ads-agent__pages">
                  {preview.lectures.site.adresses.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noreferrer">
                        {u.replace("https://tim-management.co", "") || "/"}
                      </a>
                    </li>
                  ))}
                </ol>
                les leads par canal et {preview.lectures.acquisition.clientsSignes} client(s) signé(s), en chiffres anonymes ;{" "}
                {preview.lectures.concurrents.suivis.length
                  ? `les publicités de ${preview.lectures.concurrents.suivis.length} concurrent(s) suivi(s) (bibliothèque ${preview.lectures.concurrents.bibliotheque})`
                  : "aucun concurrent (aucun n'est suivi)"}
                .
              </li>
              {preview.lectures.acquisition.manque.map((m) => (
                <li key={m} className="ads-gen__warn">
                  Manque : {m}.
                </li>
              ))}
              <li>Créas possibles cette semaine : {preview.creasPossibles}.</li>
            </ul>
          )}
          {last && (
            <p className={last.statut === "a-valider" ? "ads-gen__done" : "ads-agent__last"}>
              Dernier passage : {STATUS[last.statut] ?? last.statut}, {eur(last.depenseEur)} sur {eur(last.budgetEur)}.{last.bilan ? ` ${last.bilan}` : ""}
              {last.motif ? ` ${last.motif}` : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}
