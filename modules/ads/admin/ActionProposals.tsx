"use client";

import { toast } from "@payloadcms/ui";
import { useState } from "react";

import { postAdmin } from "./post-admin";

/**
 * « À valider » › les actions de l'agent sur les campagnes en ligne (plan
 * Publicité, phase 2) : changer un budget, mettre en pause, réactiver. Valider
 * applique chez Meta après avoir revérifié les garde-fous ; refuser la classe.
 * Le clic EST l'action.
 */

export type ProposedAction = { id: number | string; campaign: string; summary: string; rationale: string; why: string | null; createdAt: string };

export function ActionProposals({ actions }: { actions: ProposedAction[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!actions.length) return null;
  const decide = async (id: number | string, choix: "valider" | "refuser") => {
    setBusy(`${id}:${choix}`);
    try {
      const r = await postAdmin<{ status: string; guardrail: string | null }>(`/api/admin/ads/decisions/${id}`, { choix });
      if (r.status === "executee") toast.success("Appliquée chez Meta.");
      else toast.info(r.guardrail ?? "Classée.");
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  return (
    <section className="ads-actions-queue">
      <h2>Actions de l&apos;agent à décider</h2>
      <ul>
        {actions.map((a) => (
          <li key={String(a.id)} className="ads-actions-queue__item">
            <div>
              <strong>{a.summary}</strong>
              <span>
                {a.campaign} · {new Date(a.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <p>{a.rationale}</p>
              {a.why && <small>{a.why}</small>}
            </div>
            <div className="ads-actions-queue__buttons">
              <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => decide(a.id, "valider")}>
                {busy === `${a.id}:valider` ? "…" : "Valider"}
              </button>
              <button type="button" className="tim-btn" disabled={busy != null} onClick={() => decide(a.id, "refuser")}>
                {busy === `${a.id}:refuser` ? "…" : "Refuser"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
