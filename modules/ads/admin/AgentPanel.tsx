"use client";

import { toast, useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import type { ControlRoom as Room } from "@/modules/ads/agent/control-room";

import { ControlRoom, RUN_STATUS } from "./ControlRoom";
import { FollowUpPanel } from "./FollowUpPanel";
import { postAdmin } from "./post-admin";
import { eur } from "./format";

type Preview = {
  campagne: { statut?: string | null };
  lancable: boolean;
  blocages: string[];
  budget: { plafondDuPassageEur: number | null; preparationMaxEur: number; coutMaximalEur: number; agentsJour: { depense: number; plafond: number }; agentsMois: { depense: number; plafond: number } };
  lectures: {
    brief: { faits: number; interdits: number; anglesSouhaites: number };
    site: { pagesAuPlus: number; adresses: string[] };
    acquisition: { leadsParCanal: number; clientsSignes: number; manque: string[] };
    concurrents: { suivis: string[]; bibliotheque: string };
    carnet: { consignes: number; apprentissages: number; aRevalider: number };
  };
  creasPossibles: number;
};
const ACTIVE = ["en-cours", "en-pause-budget"];

const plural = (n: number, one: string, many: string) => (n ? `${n} ${n > 1 ? many : one}` : `aucun${one.startsWith("consigne") ? "e" : ""} ${one}`);

/**
 * L'agent de campagne, dans l'onglet « Agent » (plan, §9 quater).
 *
 * Avant le clic : ce que l'agent va lire et ce que le passage peut coûter AU
 * PLUS — le bouton n'est actif que si rien ne bloque. Pendant un passage :
 * « Arrêter », toujours à portée. Les deux boutons sont les gestes eux-mêmes :
 * pas de confirmation.
 *
 * En dessous, la salle de contrôle (commit 7) : le passage en cours ou le
 * dernier, ou un précédent choisi dans la liste.
 *
 * Une campagne EN LIGNE n'a plus de lancement à la main : le suivi (§9 nonies)
 * s'affiche en tête, et la salle de contrôle montre ses passages.
 */
export function AgentPanel() {
  const { id } = useDocumentInfo();
  const [objective, setObjective] = useState("");
  const [capEur, setCapEur] = useState("2");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [room, setRoom] = useState<Room>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = id ? `/api/admin/ads/campaigns/${encodeURIComponent(String(id))}/agent` : null;
  // L'aperçu complet (lourd : CRM, site, plafonds) — au chargement et après une saisie du plafond, pas en boucle.
  const runParam = runId ? `&run=${encodeURIComponent(runId)}` : "";
  const load = useCallback(() => {
    if (!base) return;
    fetch(`${base}?cap=${encodeURIComponent(capEur)}${runParam}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { preview: Preview; room: Room } | null) => {
        setPreview(d?.preview ?? null);
        setRoom(d?.room ?? null);
      })
      .catch(() => null);
  }, [base, capEur, runParam]);

  useEffect(() => {
    const t = setTimeout(load, 500); // on attend la fin de la frappe dans le champ « plafond »
    return () => clearTimeout(t);
  }, [load]);
  // Le passage le plus récent tourne-t-il ? (la salle peut montrer un passage précédent pendant ce temps)
  const current = room?.passages[0] ?? null;
  const running = Boolean(current && ACTIVE.includes(current.statut));
  // Pendant un passage : seulement la salle de contrôle, toutes les 5 secondes ; l'aperçu complet revient quand il se termine.
  useEffect(() => {
    if (!running || !base) return;
    const t = setInterval(() => {
      fetch(`${base}?status=1${runParam}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { room: Room } | null) => {
          if (!d) return;
          setRoom(d.room);
          if (!d.room?.passages[0] || !ACTIVE.includes(d.room.passages[0].statut)) load();
        })
        .catch(() => null);
    }, 5_000);
    return () => clearInterval(t);
  }, [running, base, runParam, load]);

  if (!id) return <p className="ads-gen ads-gen--muted">Enregistrez la campagne pour pouvoir lancer l&apos;agent.</p>;

  const post = async (url: string, body: unknown, ok: string) => {
    setBusy(true);
    try {
      await postAdmin(url, body);
      toast.success(ok);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canLaunch = Boolean(preview?.lancable && objective.trim() && !busy && Number(capEur) > 0);
  // Une campagne lue chez la régie ne se prépare plus : ses agents de suivi passent seuls (panneau du haut).
  const online = Boolean(preview?.campagne.statut && preview.campagne.statut !== "brouillon");

  return (
    <>
      <FollowUpPanel campaignId={String(id)} />
      <section className="ads-gen ads-agent">
        <div className="ads-gen__head">
          <strong>{online ? "Passages des agents" : "Agent de campagne"}</strong>
          <span>
            {online
              ? "Chaque passage — suivi tous les 2 jours, du lundi, du mois, ou préparation de nouvelles créas demandée par l'analyste — avec ce qu'il a lu, décidé et dépensé."
              : "Il prépare positionnement, audiences, angles, textes et briefs Claude Design, et dépose les créas « À valider ». Rien n'est publié chez Meta."}
          </span>
        </div>

        {running && current && (
          <div className="ads-agent__status">
            <span className="ads-badge ads-badge--test">{RUN_STATUS[current.statut] ?? current.statut}</span>
            <span>
              Dépensé <strong>{eur(current.depenseEur)}</strong> sur {eur(current.budgetEur)}
            </span>
            <button type="button" className="tim-btn ads-actions__danger" disabled={busy} onClick={() => post(`/api/admin/ads/agent-runs/${encodeURIComponent(String(current.id))}/stop`, {}, "Passage arrêté.")}>
              Arrêter
            </button>
          </div>
        )}

        {!running && !online && (
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
                  ; {plural(preview.lectures.carnet.consignes, "consigne active", "consignes actives")} et{" "}
                  {plural(preview.lectures.carnet.apprentissages, "apprentissage", "apprentissages")} du carnet
                  {preview.lectures.carnet.aRevalider ? ` (dont ${preview.lectures.carnet.aRevalider} à revalider)` : ""}.
                </li>
                {preview.lectures.acquisition.manque.map((m) => (
                  <li key={m} className="ads-gen__warn">
                    Manque : {m}.
                  </li>
                ))}
                <li>Créas possibles cette semaine : {preview.creasPossibles}.</li>
              </ul>
            )}
          </>
        )}

        {room && <ControlRoom room={room} onSelectRun={(id) => setRunId(id === String(room.passages[0]?.id) ? null : id)} />}

        {id != null && (
          <nav className="ads-agent__journals" aria-label="Journaux de la campagne">
            <a href={`/admin/collections/ad-agent-runs?where[campaign][equals]=${id}`}>Tous les passages de cette campagne →</a>
            <a href={`/admin/collections/ad-decisions?where[campaign][equals]=${id}`}>Toutes ses décisions →</a>
          </nav>
        )}
      </section>
    </>
  );
}
