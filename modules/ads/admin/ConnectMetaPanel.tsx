"use client";

import { toast } from "@payloadcms/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CONNECTION_NOTICES, type NoticeKey } from "@/modules/ads/lib/meta-oauth";

type Choice = { externalId: string; name: string; currency: string; known: boolean; status: string | null };
type Pending = { simulated: boolean; allowed: string[]; accounts: Choice[] | null };

/**
 * En tête de « Comptes publicitaires » : brancher un compte, et le retour de Meta.
 *
 * La voie principale est le jeton d'utilisateur système (sans échéance, D11) :
 * identifiant + jeton, vérifiés par Meta avant tout enregistrement. L'OAuth
 * reste en SECOURS, replié. Quand un jeton OAuth ouvre plusieurs comptes, le
 * choix s'affiche ici — seulement les comptes autorisés ; un compte déjà connu
 * se RECONNECTE, il n'en crée pas un second.
 */
export function ConnectMetaPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const notice = params.get("connexion") as NoticeKey | null;
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [externalId, setExternalId] = useState("");
  const [token, setToken] = useState("");
  const [showOauth, setShowOauth] = useState(false);

  const connectSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("system");
    try {
      const res = await fetch("/api/admin/ads/meta/system-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId, token }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: boolean; name?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      // Le jeton ne reste pas dans la page une seconde de plus que nécessaire.
      setToken("");
      setExternalId("");
      toast.success(`${data.name} ${data.created ? "connecté" : "reconnecté"} par jeton d'utilisateur système.`);
      router.replace(`?connexion=ok&nom=${encodeURIComponent(data.name ?? "")}`, { scroll: false });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    fetch("/api/admin/ads/meta/pending", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Pending | null) => {
        setPending(d);
        // Un seul compte autorisé : il est pré-rempli — il n'y a rien à choisir.
        if (d?.allowed?.length === 1) setExternalId((v) => v || d.allowed[0]);
      })
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

      {/* Voie principale : le jeton d'utilisateur système (sans échéance). */}
      <form className="ads-connect__row ads-connect__row--form" onSubmit={connectSystem}>
        <div className="ads-connect__text">
          <strong>Connecter un compte Meta</strong>
          <span>
            Avec un <em>jeton d&apos;utilisateur système</em> du portefeuille business : il n&apos;expire pas. Meta confirme
            que le jeton ouvre bien ce compte avant tout enregistrement ; un compte déjà connu est reconnecté.
          </span>
        </div>
        <div className="ads-connect__fields">
          {(pending?.allowed?.length ?? 0) > 1 ? (
            <select
              className="ads-connect__input"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              aria-label="Compte publicitaire"
            >
              <option value="">Compte…</option>
              {pending!.allowed.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="ads-connect__input"
              placeholder="act_…"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              aria-label="Identifiant du compte publicitaire"
              autoComplete="off"
              spellCheck={false}
              disabled={pending != null && pending.allowed.length === 0}
            />
          )}
          <input
            className="ads-connect__input ads-connect__input--token"
            type="password"
            placeholder="Jeton d'utilisateur système"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="Jeton d'utilisateur système"
            autoComplete="off"
          />
          <button
            type="submit"
            className="tim-btn tim-btn--primary"
            disabled={busy != null || !externalId.trim() || !token.trim() || (pending != null && pending.allowed.length === 0)}
          >
            {busy === "system" ? "Vérification…" : "Vérifier et connecter"}
          </button>
        </div>
        {pending != null && pending.allowed.length === 0 && !pending.simulated && (
          <p className="ads-connect__blocked">
            Aucun compte n&apos;est autorisé : posez <code>META_ALLOWED_AD_ACCOUNTS</code> (ex. act_211325410243618) sur Vercel,
            et dans <code>.env.local</code> pour un poste de dev.
          </p>
        )}
      </form>

      {/* Secours : l'OAuth (jeton de ~60 jours). Replié : ce n'est pas le chemin normal. */}
      <p className="ads-connect__fallback">
        {showOauth ? (
          <>
            Secours — connexion par OAuth (jeton de ~60 jours, alerte à J-7). Demande que l&apos;adresse de retour soit déclarée
            dans l&apos;app Meta.{" "}
            <a className="ads-connect__link" href="/api/admin/ads/meta/connect">
              Connecter par OAuth
            </a>
          </>
        ) : (
          <button type="button" className="ads-connect__link" onClick={() => setShowOauth(true)}>
            Pas de jeton système ? Connexion par OAuth (secours)
          </button>
        )}
      </p>

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
