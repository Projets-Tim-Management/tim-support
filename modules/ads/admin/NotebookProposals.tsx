"use client";

import { toast } from "@payloadcms/ui";
import { useState } from "react";

import { postAdmin } from "./post-admin";

/**
 * En tête de « À valider » : ce que l'agent lira au prochain passage, si on le
 * confirme. Une consigne proposée naît d'un refus de créa ; un apprentissage
 * « global proposé » attend d'être étendu à toutes les campagnes.
 *
 * Le clic EST l'action. Le texte d'une consigne reste modifiable jusqu'au
 * clic : c'est ce qui est dans le champ qui devient la consigne.
 */

export type ProposedInstruction = { id: number | string; text: string; refusal: string | null; creativeAngle: string | null; campaign: { id: number | string; name: string } | null };
export type ProposedLearning = { id: number | string; statement: string; confidence: string | null; campaign: { id: number | string; name: string } | null };

async function post(url: string, body: unknown, done: string): Promise<boolean> {
  try {
    await postAdmin(url, body);
    toast.success(done);
    window.location.reload();
    return true;
  } catch (e) {
    toast.error((e as Error).message || "Action impossible.");
    return false;
  }
}

function InstructionRow({ p }: { p: ProposedInstruction }) {
  const [text, setText] = useState(p.text);
  const [scope, setScope] = useState<"campagne" | "global">(p.campaign ? "campagne" : "global");
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (what: string, body: unknown, done: string) => {
    setBusy(what);
    if (!(await post(`/api/admin/ads/instructions/${p.id}`, body, done))) setBusy(null);
  };

  return (
    <li className="ads-proposal">
      <p className="ads-proposal__origin">
        Refus de « {p.creativeAngle ?? "une créa"} »{p.campaign ? ` (${p.campaign.name})` : ""}
        {p.refusal ? ` — ${p.refusal}` : ""}
      </p>
      <textarea className="ads-proposal__text" value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Texte de la consigne" />
      <div className="ads-proposal__actions">
        <select value={scope} onChange={(e) => setScope(e.target.value as "campagne" | "global")} aria-label="Portée de la consigne">
          {p.campaign && <option value="campagne">Pour cette campagne</option>}
          <option value="global">Pour toutes les campagnes</option>
        </select>
        <button type="button" className="tim-btn tim-btn--primary" disabled={!text.trim() || busy != null} onClick={() => act("ok", { action: "activer", text, scope }, "Consigne active : l'agent la lira au prochain passage.")}>
          {busy === "ok" ? "…" : "En faire une consigne"}
        </button>
        <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("no", { action: "ecarter" }, "Consigne écartée.")}>
          {busy === "no" ? "…" : "Non"}
        </button>
      </div>
    </li>
  );
}

function LearningRow({ p }: { p: ProposedLearning }) {
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (what: string, action: string, done: string) => {
    setBusy(what);
    if (!(await post(`/api/admin/ads/learnings/${p.id}`, { action }, done))) setBusy(null);
  };
  return (
    <li className="ads-proposal">
      <p className="ads-proposal__origin">
        Appris sur {p.campaign ? `« ${p.campaign.name} »` : "une campagne"}
        {p.confidence ? ` — confiance ${p.confidence}` : ""}
      </p>
      <p className="ads-proposal__statement">{p.statement}</p>
      <div className="ads-proposal__actions">
        <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => act("ok", "promouvoir", "Apprentissage étendu à toutes les campagnes.")}>
          {busy === "ok" ? "…" : "Valider pour toutes les campagnes"}
        </button>
        <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("no", "garder", "Apprentissage gardé pour sa campagne.")}>
          {busy === "no" ? "…" : "Garder pour cette campagne"}
        </button>
      </div>
    </li>
  );
}

export function NotebookProposals({ instructions, learnings }: { instructions: ProposedInstruction[]; learnings: ProposedLearning[] }) {
  if (!instructions.length && !learnings.length) return null;
  return (
    <section className="ads-proposals" aria-label="Pour l'agent">
      <h2 className="ads-proposals__title">Pour l'agent, à confirmer</h2>
      <p className="ads-proposals__sub">Lu au prochain passage seulement si vous le confirmez. Une consigne n'assouplit aucun garde-fou.</p>
      <ul className="ads-proposals__list">
        {instructions.map((p) => (
          <InstructionRow key={`c${p.id}`} p={p} />
        ))}
        {learnings.map((p) => (
          <LearningRow key={`a${p.id}`} p={p} />
        ))}
      </ul>
    </section>
  );
}
