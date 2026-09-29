"use client";

import { PopupList, toast, useAuth, useDocumentInfo, useField, useModal } from "@payloadcms/ui";
import { useState } from "react";

import { isSuperAdmin } from "@/core/access";

import { PURGE_MODAL_SLUG } from "./purge-slug";

/**
 * Menu ⋯ d'un compte publicitaire.
 *
 * « Archiver » d'abord, et c'est le geste normal : le compte n'est plus lu chez
 * la régie, son historique reste. « Réactiver » recalcule l'état d'après les
 * jetons. Le clic EST l'action — pas de case à cocher puis enregistrer.
 *
 * « Supprimer définitivement… » n'apparaît qu'au super-admin, et ouvre une
 * confirmation qui dit combien de lignes partiront.
 */
export function AdAccountEditMenu() {
  const { id } = useDocumentInfo();
  const { user } = useAuth();
  const { openModal } = useModal();
  const { value: status } = useField<string>({ path: "status" });
  const [busy, setBusy] = useState(false);

  if (!id) return null;
  const archived = status === "archive";

  const toggleArchive = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ads/accounts/${encodeURIComponent(String(id))}/archive`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      // Le formulaire relit la fiche : l'état affiché est celui du serveur.
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message || "Action impossible.");
      setBusy(false);
    }
  };

  return (
    <>
      <PopupList.Button disabled={busy} onClick={toggleArchive}>
        {archived ? "Réactiver le compte" : "Archiver le compte"}
      </PopupList.Button>
      {isSuperAdmin(user) && (
        <PopupList.Button onClick={() => openModal(PURGE_MODAL_SLUG)}>Supprimer définitivement…</PopupList.Button>
      )}
    </>
  );
}
