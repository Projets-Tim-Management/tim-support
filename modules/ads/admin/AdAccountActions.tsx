"use client";

import { toast, useAuth, useDocumentInfo, useField, useModal } from "@payloadcms/ui";
import { useState } from "react";

import { isSuperAdmin } from "@/core/access";

import { PURGE_MODAL_SLUG } from "./purge-slug";

/**
 * Les actions d'un compte publicitaire, en BOUTONS à côté de « Sauvegarder ».
 *
 * Pas dans le menu ⋯ : Payload n'affiche ce menu que si l'utilisateur peut
 * créer ou supprimer dans la collection — or ces deux droits sont fermés ici
 * (création vérifiée par Meta, suppression par la purge). Le menu disparaissait
 * donc entier, actions comprises (constaté en production le 29/09/2026).
 *
 * - « Synchroniser maintenant » : la synchro de la nuit, tout de suite.
 * - « Archiver » / « Réactiver » : le geste normal ; le clic EST l'action.
 * - « Supprimer définitivement… » : super-admin seul, ouvre une confirmation qui
 *   annonce le nombre de lignes effacées.
 */
export function AdAccountActions() {
  const { id } = useDocumentInfo();
  const { user } = useAuth();
  const { openModal } = useModal();
  const { value: status } = useField<string>({ path: "status" });
  const [busy, setBusy] = useState<"sync" | "archive" | null>(null);

  if (!id) return null;
  const archived = status === "archive";
  const base = `/api/admin/ads/accounts/${encodeURIComponent(String(id))}`;

  const run = async (kind: "sync" | "archive", init: RequestInit, done: (data: Record<string, unknown>) => string) => {
    setBusy(kind);
    try {
      const res = await fetch(`${base}/${kind}`, { method: "POST", credentials: "include", ...init });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(done(data));
      // Le formulaire relit la fiche : l'état affiché est celui du serveur.
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message || "Action impossible.");
      setBusy(null);
    }
  };

  return (
    <div className="ads-actions">
      {!archived && (
        <button
          type="button"
          className="tim-btn"
          disabled={busy != null}
          onClick={() =>
            run("sync", {}, (d) => `Synchronisé : ${d.campaigns ?? 0} campagne(s), ${d.written ?? 0} ligne(s) écrites, ${d.unchanged ?? 0} inchangée(s).`)
          }
        >
          {busy === "sync" ? "Synchro…" : "Synchroniser maintenant"}
        </button>
      )}
      <button
        type="button"
        className="tim-btn"
        disabled={busy != null}
        onClick={() =>
          run(
            "archive",
            { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !archived }) },
            () => (archived ? "Compte réactivé." : "Compte archivé : il n'est plus synchronisé, son historique reste."),
          )
        }
      >
        {busy === "archive" ? "…" : archived ? "Réactiver" : "Archiver"}
      </button>
      {isSuperAdmin(user) && (
        <button type="button" className="tim-btn ads-actions__danger" disabled={busy != null} onClick={() => openModal(PURGE_MODAL_SLUG)}>
          Supprimer définitivement…
        </button>
      )}
    </div>
  );
}
