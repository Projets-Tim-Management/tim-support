"use client";

import { useConfig, useDocumentInfo, useModal } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { PURGE_MODAL_SLUG } from "./purge-slug";

type Impact = { campaigns: number; metrics: number };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

/**
 * Confirmation de la suppression DÉFINITIVE d'un compte publicitaire.
 *
 * Elle annonce ce qui partira — le compte, N campagnes, M lignes de chiffres —
 * et le bouton le répète : on confirme un nombre, pas un « êtes-vous sûr ».
 * Si la synchro écrit entre l'ouverture et le clic, le serveur refuse et les
 * nouveaux chiffres s'affichent : on ne confirme pas un nombre pour en effacer
 * un autre.
 *
 * Monté en `beforeDocumentControls` pour survivre à la fermeture du menu.
 */
export function PurgeAccountModal() {
  const {
    config: {
      routes: { admin },
    },
  } = useConfig();
  const { id, title } = useDocumentInfo();
  const { closeModal, isModalOpen } = useModal();
  const router = useRouter();
  const open = Boolean(id) && isModalOpen(PURGE_MODAL_SLUG);

  const [impact, setImpact] = useState<Impact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/admin/ads/accounts/${encodeURIComponent(String(id))}/purge`;

  useEffect(() => {
    if (!open) return;
    setImpact(null);
    setError(null);
    fetch(url, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Impact & { error?: string };
        if (!res.ok) throw new Error(data.error || String(res.status));
        setImpact({ campaigns: data.campaigns, metrics: data.metrics });
      })
      .catch((e: Error) => setError(e.message || "Impossible de compter ce qui serait effacé."));
  }, [open, url]);

  if (!open || typeof document === "undefined") return null;
  const cancel = () => !busy && closeModal(PURGE_MODAL_SLUG);

  const confirm = async () => {
    if (!impact) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(impact),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; impact?: Impact };
      if (res.status === 409 && data.impact) {
        setImpact(data.impact);
        throw new Error("Les chiffres ont changé pendant la confirmation. Relisez-les avant de confirmer.");
      }
      if (!res.ok) throw new Error(data.error || String(res.status));
      router.push(`${admin}/collections/ad-accounts`);
    } catch (e) {
      setError((e as Error).message || "Suppression impossible.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className="tim-archive" onClick={cancel}>
      <div className="tim-archive__panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tim-archive__title">Supprimer définitivement — {title || "ce compte"}</h2>
        <p className="tim-archive__text">
          Préférez <strong>« Archiver le compte »</strong> : il n&apos;est plus synchronisé et son historique reste
          disponible pour une reconnexion et pour les agents. La suppression, elle, ne se rattrape pas.
        </p>
        {impact ? (
          <p className="tim-archive__text">
            Seront effacés : le compte, <strong>{plural(impact.campaigns, "campagne", "campagnes")}</strong> et{" "}
            <strong>{plural(impact.metrics, "ligne de chiffres quotidiens", "lignes de chiffres quotidiens")}</strong>.
          </p>
        ) : (
          !error && <p className="tim-archive__text">Comptage de ce qui serait effacé…</p>
        )}
        {error && <p className="tim-loss__error">{error}</p>}
        <div className="tim-archive__actions">
          <button type="button" className="tim-archive__btn tim-archive__btn--ghost" onClick={cancel} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--danger"
            disabled={busy || !impact}
            onClick={confirm}
          >
            {busy
              ? "Suppression…"
              : impact
                ? `Effacer le compte, ${plural(impact.campaigns, "campagne", "campagnes")} et ${plural(impact.metrics, "ligne", "lignes")}`
                : "Supprimer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
