"use client";

import { toast } from "@payloadcms/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CONNECTION_NOTICES, type NoticeKey } from "@/modules/ads/lib/meta-oauth";

type Choice = { externalId: string; name: string; currency: string; known: boolean; status: string | null };
type Pending = { simulated: boolean; accounts: Choice[] | null };

/**
 * En tête de « Comptes publicitaires » : comment brancher un compte, et le
 * retour de Meta.
 *
 * Deux chemins, dits côte à côte parce qu'on choisit entre eux : l'OAuth (un
 * clic, jeton de ~60 jours) ou le jeton d'utilisateur système (collé sur la
 * fiche, sans échéance — la cible). Quand le jeton ouvre plusieurs comptes, le
 * choix s'affiche ICI, sans quitter la liste ; un compte déjà connu se
 * RECONNECTE, il n'en crée pas un second.
 */
export function ConnectMetaPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const notice = params.get("connexion") as NoticeKey | null;
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ads/meta/pending", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Pending | null) => setPending(d))
      .catch(() => setPending(null));
  }, [notice]);

  const clearNotice = () => router.replace("?", { scroll: false });

  const choose = async (c: Choice) => {
    setBusy(c.externalId);
    try {
      const res = await fetch("/api/admin/ads/meta/pending", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: c.externalId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: boolean };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(`${c.name} ${data.created ? "connecté" : "reconnecté"}.`);
      router.replace("?connexion=ok", { scroll: false });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  };

  const abandon = async () => {
    await fetch("/api/admin/ads/meta/pending", { method: "DELETE", credentials: "include" }).catch(() => null);
    setPending((p) => (p ? { ...p, accounts: null } : p));
    clearNotice();
  };

  const message = notice && notice in CONNECTION_NOTICES ? CONNECTION_NOTICES[notice] : null;
  const detail = params.get("detail");
  const name = params.get("nom");
  const tone = notice === "ok" ? "ok" : notice === "choix" ? "info" : notice ? "ko" : null;

  return (
    <section className="ads-connect">
      {pending?.simulated && (
        <p className="ads-simulated">
          <strong>Données simulées</strong> (ADS_META_MOCK=1) : aucun appel n&apos;est fait à Meta. Le compte et les
          campagnes portent le préfixe « [SIMULÉ] » — la base est partagée avec la production, archivez-les une fois le
          vrai compte branché.
        </p>
      )}

      <div className="ads-connect__row">
        <div className="ads-connect__text">
          <strong>Brancher un compte Meta</strong>
          <span>
            Par OAuth en un clic (jeton de ~60 jours, alerte à J-7), ou en collant un <em>jeton d&apos;utilisateur système</em>{" "}
            sur la fiche du compte — sans échéance, c&apos;est la cible.
          </span>
        </div>
        <a className="tim-btn tim-btn--primary" href="/api/admin/ads/meta/connect">
          Connecter un compte Meta
        </a>
      </div>

      {message && tone && (
        <p className={`ads-connect__notice ads-connect__notice--${tone}`}>
          {notice === "ok" && name ? `${name} : ` : ""}
          {message}
          {detail ? ` ${detail}` : ""}
          {notice !== "choix" && (
            <button type="button" className="ads-connect__close" onClick={clearNotice} aria-label="Fermer">
              ×
            </button>
          )}
        </p>
      )}

      {pending?.accounts && (
        <ul className="ads-connect__choices">
          {pending.accounts.map((c) => (
            <li key={c.externalId} className="ads-connect__choice">
              <span>
                <strong>{c.name}</strong> <span className="ads-connect__id">{c.externalId} · {c.currency}</span>
                {c.known && <span className="ads-connect__known">déjà connu{c.status === "archive" ? " — archivé" : ""}</span>}
              </span>
              <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => choose(c)}>
                {busy === c.externalId ? "Connexion…" : c.known ? "Reconnecter" : "Connecter"}
              </button>
            </li>
          ))}
          <li className="ads-connect__choice ads-connect__choice--cancel">
            <button type="button" className="tim-btn" disabled={busy != null} onClick={abandon}>
              Abandonner
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
