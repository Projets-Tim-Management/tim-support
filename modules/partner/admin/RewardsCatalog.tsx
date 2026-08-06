"use client";

import { useAuth } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isPartnerUtilisateur } from "@/core/access";

/**
 * Catalogue de récompenses pour le PARTENAIRE-UTILISATEUR (beforeListTable de la
 * collection `rewards`). Affiche son solde de points et permet de commander via
 * l'endpoint sécurisé /api/partner/redeem (débit des points garanti côté serveur).
 * Pour les autres rôles : ne rend rien (l'admin garde le tableau standard).
 */

interface Reward {
  id: number | string;
  title?: string;
  cost?: number;
  stock?: number;
  image?: { url?: string } | number | null;
}

const imageUrl = (r: Reward): string | null =>
  r.image && typeof r.image === "object" ? (r.image.url ?? null) : null;

export default function RewardsCatalog() {
  const { user } = useAuth();
  const isUtil = isPartnerUtilisateur(user);

  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [msg, setMsg] = useState<{ id: number | string; text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!isUtil) return;
    document.body.classList.add("tim-catalog-mode");
    return () => document.body.classList.remove("tim-catalog-mode");
  }, [isUtil]);

  const loadBalance = useCallback(async () => {
    const r = await fetch(`/payload-api/point-transactions?limit=40000&depth=0`, {
      credentials: "include",
    }).then((res) => res.json());
    const docs = (r?.docs as { delta?: number }[]) ?? [];
    setBalance(docs.reduce((s, t) => s + (Number(t.delta) || 0), 0));
  }, []);

  useEffect(() => {
    if (!isUtil) return;
    let cancelled = false;
    (async () => {
      try {
        // `-cost` : les récompenses les plus chères en tête — ce sont elles qui
        // donnent envie de cumuler des points, et elles portent les visuels.
        const rw = await fetch(`/payload-api/rewards?limit=200&depth=1&sort=-cost`, {
          credentials: "include",
        }).then((res) => res.json());
        if (!cancelled) setRewards((rw?.docs as Reward[]) ?? []);
        await loadBalance();
      } catch {
        if (!cancelled) setRewards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isUtil, loadBalance]);

  const order = async (r: Reward) => {
    setBusyId(r.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/partner/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reward: r.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof data?.balance === "number") setBalance(data.balance);
        else await loadBalance();
        setMsg({ id: r.id, text: "Commande enregistrée ✓", ok: true });
        setRewards((prev) =>
          prev
            ? prev.map((x) =>
                x.id === r.id && typeof x.stock === "number" && x.stock > 0 ? { ...x, stock: x.stock - 1 } : x,
              )
            : prev,
        );
      } else {
        setMsg({ id: r.id, text: data?.message || "Commande impossible.", ok: false });
      }
    } catch {
      setMsg({ id: r.id, text: "Commande impossible, réessayez.", ok: false });
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => rewards ?? [], [rewards]);

  if (!isUtil) return null;

  return (
    <div className="tim-catalog">
      <header className="tim-catalog__head">
        <h1 className="tim-catalog__title">Récompenses</h1>
        <p className="tim-catalog__sub">Échangez vos points contre des récompenses.</p>
      </header>

      <div className="tim-catalog__balance">
        <span className="tim-catalog__balance-label">Votre solde</span>
        <span className="tim-catalog__balance-value">
          {balance === null ? "…" : balance.toLocaleString("fr-FR")} pts
        </span>
      </div>

      {rewards === null ? (
        <p className="tim-catalog__empty">Chargement…</p>
      ) : sorted.length === 0 ? (
        <p className="tim-catalog__empty">Aucune récompense disponible pour le moment.</p>
      ) : (
        <div className="tim-catalog__grid">
          {sorted.map((r) => {
            const url = imageUrl(r);
            const cost = r.cost ?? 0;
            const soldOut = r.stock === 0;
            const tooExpensive = balance !== null && balance < cost;
            const disabled = busyId === r.id || soldOut || tooExpensive;
            return (
              <article key={String(r.id)} className={`tim-mcard${soldOut ? " is-done" : ""}`}>
                <div className="tim-mcard__top">
                  <span className="tim-mcard__logo" aria-hidden>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" />
                    ) : (
                      "🎁"
                    )}
                  </span>
                  <span className="tim-mcard__cost">{cost.toLocaleString("fr-FR")} pts</span>
                </div>
                <h2 className="tim-mcard__title">{r.title || "Récompense"}</h2>

                {msg && msg.id === r.id && (
                  <p className={msg.ok ? "tim-mcard__ok" : "tim-mcard__error"}>{msg.text}</p>
                )}

                <div className="tim-mcard__foot">
                  {/* Le nombre d'exemplaires restants ne regarde pas le
                      partenaire : c'est une donnée de gestion, et l'afficher
                      pousse à la précipitation. Seule l'indisponibilité compte
                      pour lui — sinon, rien. */}
                  {soldOut ? <span className="tim-mcard__soldout">Épuisée</span> : <span />}
                  <button
                    type="button"
                    className="tim-mcard__btn"
                    onClick={() => void order(r)}
                    disabled={disabled}
                    title={tooExpensive ? "Points insuffisants" : soldOut ? "Épuisée" : undefined}
                  >
                    {busyId === r.id ? "…" : "Commander"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
