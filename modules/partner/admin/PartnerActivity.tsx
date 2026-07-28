"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { nf } from "@/modules/partner/lib/format";

/**
 * Vue « Points & activité » d'un partenaire (champ ui de la fiche).
 * Lecture seule : solde calculé (somme du ledger), totaux gagné/dépensé, et les
 * dernières transactions / soumissions de missions / commandes de récompenses.
 * Données lues via l'API REST Payload à partir de l'id du document courant.
 */

type Tx = { id: number | string; delta?: number; motif?: string; source?: string; createdAt?: string };
type Sub = {
  id: number | string;
  number?: number;
  status?: string;
  createdAt?: string;
  mission?: { title?: string } | number | string;
};
type Order = {
  id: number | string;
  number?: number;
  status?: string;
  cost?: number;
  createdAt?: string;
  reward?: { title?: string } | number | string;
};

const SOURCE_LABEL: Record<string, string> = {
  contrat: "Contrat / contact",
  avis: "Avis",
  ajustement: "Ajustement",
  echange: "Échange",
};
const SUB_STATUS: Record<string, string> = {
  pending: "En attente",
  approved: "Validée",
  rejected: "Refusée",
};
const ORDER_STATUS: Record<string, string> = {
  pending: "À traiter",
  approved: "Validée",
  shipped: "Expédiée",
  delivered: "Remise",
  cancelled: "Annulée",
};

const fmtDate = (v?: string) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "";
const relTitle = (r: unknown, fallback: string) =>
  r && typeof r === "object" ? ((r as { title?: string }).title ?? fallback) : fallback;

async function fetchList<T>(collection: string, id: number | string): Promise<T[]> {
  try {
    const res = await fetch(
      `/payload-api/${collection}?where[partner][equals]=${id}&limit=500&depth=1&sort=-createdAt`,
      { credentials: "include" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.docs ?? []) as T[];
  } catch {
    return [];
  }
}

export function PartnerActivity() {
  const { id } = useDocumentInfo();
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Tx[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [t, s, o] = await Promise.all([
        fetchList<Tx>("point-transactions", id),
        fetchList<Sub>("mission-submissions", id),
        fetchList<Order>("reward-orders", id),
      ]);
      if (cancelled) return;
      setTx(t);
      setSubs(s);
      setOrders(o);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="partner-activity">
        <p className="partner-activity__empty">Enregistrez le partenaire pour voir son activité.</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="partner-activity">
        <p className="partner-activity__empty">Chargement de l'activité…</p>
      </div>
    );
  }

  const balance = tx.reduce((s, t) => s + (t.delta ?? 0), 0);
  const earned = tx.filter((t) => (t.delta ?? 0) > 0).reduce((s, t) => s + (t.delta ?? 0), 0);
  const spent = tx.filter((t) => (t.delta ?? 0) < 0).reduce((s, t) => s + (t.delta ?? 0), 0);
  const subsApproved = subs.filter((s) => s.status === "approved").length;
  const subsPending = subs.filter((s) => s.status === "pending").length;

  return (
    <div className="partner-activity">
      {/* Tuiles de synthèse */}
      <div className="pa-stats">
        <div className="pa-stat pa-stat--strong">
          <span className="pa-stat__label">Solde de points</span>
          <span className="pa-stat__value">{nf.format(balance)}</span>
        </div>
        <div className="pa-stat">
          <span className="pa-stat__label">Total gagné</span>
          <span className="pa-stat__value pa-stat__value--pos">+{nf.format(earned)}</span>
        </div>
        <div className="pa-stat">
          <span className="pa-stat__label">Total dépensé</span>
          <span className="pa-stat__value pa-stat__value--neg">{nf.format(spent)}</span>
        </div>
        <div className="pa-stat">
          <span className="pa-stat__label">Missions validées</span>
          <span className="pa-stat__value">
            {subsApproved}
            {subsPending > 0 && <span className="pa-stat__sub"> · {subsPending} en attente</span>}
          </span>
        </div>
        <div className="pa-stat">
          <span className="pa-stat__label">Commandes</span>
          <span className="pa-stat__value">{orders.length}</span>
        </div>
      </div>

      {/* Ledger */}
      <section className="pa-section">
        <h3 className="pa-section__title">
          Dernières transactions
          <span className="pa-section__count">{tx.length}</span>
        </h3>
        {tx.length === 0 ? (
          <p className="pa-empty">Aucune transaction.</p>
        ) : (
          <ul className="pa-list">
            {tx.slice(0, 8).map((t) => (
              <li key={String(t.id)} className="pa-row">
                <span className={`pa-delta ${(t.delta ?? 0) >= 0 ? "pa-delta--pos" : "pa-delta--neg"}`}>
                  {(t.delta ?? 0) >= 0 ? "+" : ""}
                  {nf.format(t.delta ?? 0)}
                </span>
                <span className="pa-row__main">
                  <Link className="pa-row__title" href={`/admin/collections/point-transactions/${t.id}`}>
                    {t.motif || "—"}
                  </Link>
                  <span className="pa-row__meta">{SOURCE_LABEL[t.source ?? ""] ?? t.source}</span>
                </span>
                <span className="pa-row__when">{fmtDate(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Missions */}
      <section className="pa-section">
        <h3 className="pa-section__title">
          Soumissions de missions
          <span className="pa-section__count">{subs.length}</span>
        </h3>
        {subs.length === 0 ? (
          <p className="pa-empty">Aucune soumission.</p>
        ) : (
          <ul className="pa-list">
            {subs.slice(0, 6).map((s) => (
              <li key={String(s.id)} className="pa-row">
                <span className={`pa-badge pa-badge--${s.status}`}>{SUB_STATUS[s.status ?? ""] ?? s.status}</span>
                <span className="pa-row__main">
                  <Link className="pa-row__title" href={`/admin/collections/mission-submissions/${s.id}`}>
                    {s.number ? `#${s.number} · ` : ""}
                    {relTitle(s.mission, "Mission")}
                  </Link>
                </span>
                <span className="pa-row__when">{fmtDate(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Commandes */}
      <section className="pa-section">
        <h3 className="pa-section__title">
          Commandes de récompenses
          <span className="pa-section__count">{orders.length}</span>
        </h3>
        {orders.length === 0 ? (
          <p className="pa-empty">Aucune commande.</p>
        ) : (
          <ul className="pa-list">
            {orders.slice(0, 6).map((o) => (
              <li key={String(o.id)} className="pa-row">
                <span className={`pa-badge pa-badge--${o.status}`}>{ORDER_STATUS[o.status ?? ""] ?? o.status}</span>
                <span className="pa-row__main">
                  <Link className="pa-row__title" href={`/admin/collections/reward-orders/${o.id}`}>
                    {o.number ? `#${o.number} · ` : ""}
                    {relTitle(o.reward, "Récompense")}
                  </Link>
                  <span className="pa-row__meta">{nf.format(o.cost ?? 0)} pts</span>
                </span>
                <span className="pa-row__when">{fmtDate(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
