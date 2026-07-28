"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { eur } from "@/modules/partner/lib/format";

/**
 * Historique MENSUEL des montants d'un client apporté (facturation au mois).
 * Une ligne par mois (datée du 1er) ; les variations intra-mois consolident le
 * mois courant. Clic sur une ligne → drawer avec le détail des licences (prix
 * par profil) et la période de validité (de quand à quand).
 */

type Line = { key?: string; label?: string; qty?: number; price?: number; subtotal?: number };
type Entry = {
  at?: string;
  totalLicences?: number;
  caHT?: number;
  commission?: number;
  commissionRate?: number;
  detail?: Line[];
};

const dOpt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };
const fmtDay = (v?: string) => (v ? new Date(v).toLocaleDateString("fr-FR", dOpt) : "—");
const fmtMonth = (v?: string) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—";

/** Dernier jour couvert par une période = veille du début de la suivante. */
function endLabel(nextStart?: string): string {
  if (!nextStart) return "aujourd'hui";
  const d = new Date(nextStart);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toLocaleDateString("fr-FR", dOpt);
}

export function PartnerClientHistory() {
  const { id } = useDocumentInfo();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/payload-api/partner-clients/${id}?depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setEntries(Array.isArray(d?.history) ? (d.history as Entry[]) : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  // Une seule ligne par mois (dédoublonnage défensif des anciennes données),
  // normalisée au 1er du mois et triée chronologiquement.
  const monthStartOf = (iso: string) => {
    const d = new Date(iso);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  };
  const byMonth = new Map<string, Entry>();
  for (const e of entries) {
    if (!e.at) continue;
    byMonth.set(monthStartOf(e.at), e); // clé = 1er du mois ; dernier gagne
  }
  const chrono = [...byMonth.entries()]
    .map(([start, e]) => ({ e, start }))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const rows = chrono
    .map((row, i) => ({ e: row.e, start: row.start, end: endLabel(chrono[i + 1]?.start) }))
    .reverse();

  const open = openIdx != null ? rows[openIdx] : null;

  return (
    <div className="cli-history">
      <h4 className="cli-history__title">Historique des montants (facturation mensuelle)</h4>
      {loading ? (
        <p className="cli-history__empty">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="cli-history__empty">Aucune période enregistrée pour l'instant.</p>
      ) : (
        <table className="cli-history__table">
          <thead>
            <tr>
              <th>Période</th>
              <th className="lic-num">Licences</th>
              <th className="lic-num">CA HT / mois</th>
              <th className="lic-num">Commission</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.start}-${i}`} className="cli-history__row" onClick={() => setOpenIdx(i)}>
                <td>
                  <span className="cli-history__month">{fmtMonth(row.start)}</span>
                  <span className="cli-history__range">
                    du {fmtDay(row.start)} au {row.end}
                  </span>
                </td>
                <td className="lic-num">{row.e.totalLicences ?? 0}</td>
                <td className="lic-num">{eur.format(row.e.caHT ?? 0)}</td>
                <td className="lic-num cli-history__commission">{eur.format(row.e.commission ?? 0)}</td>
                <td className="lic-num cli-history__chevron">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="cli-history__note">
        Une ligne par mois (au 1er). Cliquez une période pour voir le détail des prix. Le tableau se
        rafraîchit au rechargement de la fiche.
      </p>

      {open && (
        <div className="cli-drawer" role="dialog" aria-modal onClick={() => setOpenIdx(null)}>
          <div className="cli-drawer__panel" onClick={(e) => e.stopPropagation()}>
            <div className="cli-drawer__head">
              <div>
                <h3 className="cli-drawer__title">{fmtMonth(open.start)}</h3>
                <p className="cli-drawer__period">
                  En vigueur du <strong>{fmtDay(open.start)}</strong> au <strong>{open.end}</strong>
                </p>
              </div>
              <button type="button" className="cli-drawer__close" onClick={() => setOpenIdx(null)} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="cli-drawer__summary">
              <div className="cli-drawer__kpi">
                <span className="cli-drawer__kpi-k">CA HT facturé / mois</span>
                <span className="cli-drawer__kpi-v">{eur.format(open.e.caHT ?? 0)}</span>
              </div>
              <div className="cli-drawer__kpi cli-drawer__kpi--commission">
                <span className="cli-drawer__kpi-k">
                  Commission partenaire{open.e.commissionRate != null ? ` · ${open.e.commissionRate} %` : ""}
                </span>
                <span className="cli-drawer__kpi-v">{eur.format(open.e.commission ?? 0)}</span>
              </div>
            </div>

            <table className="cli-drawer__table">
              <thead>
                <tr>
                  <th>Profil</th>
                  <th className="lic-num">Qté</th>
                  <th className="lic-num">Prix € HT</th>
                  <th className="lic-num">Sous-total</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(open.e.detail) && open.e.detail.length > 0 ? (
                  open.e.detail.map((l, i) => (
                    <tr key={`${l.key}-${i}`}>
                      <td>{l.label}</td>
                      <td className="lic-num">{l.qty ?? 0}</td>
                      <td className="lic-num">{eur.format(l.price ?? 0)}</td>
                      <td className="lic-num">{eur.format(l.subtotal ?? 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="cli-drawer__missing">
                      Détail non disponible pour cette période (ligne créée avant la mise à jour).
                      Ré-enregistrez le client pour le générer.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="cli-drawer__total">
                  <td>Total · {open.e.totalLicences ?? 0} licences</td>
                  <td className="lic-num">{open.e.totalLicences ?? 0}</td>
                  <td className="lic-num" />
                  <td className="lic-num">{eur.format(open.e.caHT ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
