"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { PaymentBadge } from "@/modules/partner/admin/BillingCells";
import type { InvoiceSummary, MonthCheck } from "@/modules/partner/lib/billing-check";
import { eur } from "@/modules/partner/lib/format";
import { monthKey, monthStart } from "@/modules/partner/lib/month";

/**
 * Historique MENSUEL des montants d'un client apporté (facturation au mois).
 * Une ligne par mois (datée du 1er) ; les variations intra-mois consolident le
 * mois courant. Clic sur une ligne → drawer avec le détail des licences (prix
 * par profil) et la période de validité (de quand à quand).
 *
 * L'historique COMMENCE avec la facturation Pennylane : avant la date de début
 * de l'abonnement, rien n'est facturé, donc rien à raconter. Chaque ligne porte
 * le tampon « Conforme Pennylane » / « Écart Pennylane » posé à l'enregistrement
 * (hook computeCA) ; pour le mois en cours, un admin voit l'état LIVE.
 */

type Line = { key?: string; label?: string; qty?: number; price?: number; subtotal?: number };
type Stamp = { start?: string | null; ok?: boolean | null; checkedAt?: string };
type Entry = {
  at?: string;
  totalLicences?: number;
  caHT?: number;
  commission?: number;
  commissionRate?: number;
  detail?: Line[];
  pennylane?: Stamp;
};
type Doc = Record<string, unknown> & { history?: Entry[]; licences?: Record<string, unknown> };
type LiveCheck = {
  pennylane: { subscriptionId: number | null; status: string | null; start: string | null } | null;
  rows: { qtyDiff: number; priceMismatch: boolean }[];
  invoices: InvoiceSummary[];
  months: MonthCheck[];
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

/** Le tampon, en un mot : conforme, écart, ou rien quand on ne sait pas. */
function StampBadge({ ok, live }: { ok?: boolean | null; live?: boolean }) {
  if (ok == null) return null;
  return (
    <span
      className={`cli-history__stamp cli-history__stamp--${ok ? "ok" : "ko"}`}
      title={live ? "État actuel de l'abonnement Pennylane" : "État de l'abonnement Pennylane au dernier enregistrement du mois"}
    >
      {ok ? "Conforme Pennylane" : "Écart Pennylane"}
    </span>
  );
}

export function PartnerClientHistory() {
  const { id } = useDocumentInfo();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState<LiveCheck | null>(null);
  // « Maintenant », figé au montage : le rendu doit rester pur.
  const [now] = useState(() => new Date());
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
      .then((r) => (r.ok ? (r.json() as Promise<Doc>) : null))
      .then((d) => {
        if (cancelled || !d) return;
        setEntries(Array.isArray(d.history) ? d.history : []);
        // État LIVE de Pennylane pour le mois en cours — réservé aux admins :
        // un 403 (partenaire) laisse simplement les tampons enregistrés.
        return fetch("/api/admin/pennylane/check", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            name: d.companyName,
            siren: d.siren,
            raisonSociale: d.raisonSociale,
            clientStatus: d.clientStatus,
            paymentMethod: d.paymentMethod,
            paymentTerms: d.paymentTerms,
            billingPeriod: d.billingPeriod,
            licences: d.licences ?? {},
          }),
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ check: LiveCheck | null }>) : null))
          .then((res) => {
            if (!cancelled && res?.check) setLive(res.check);
          })
          .catch(() => {});
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
  const byMonth = new Map<string, Entry>();
  for (const e of entries) {
    if (!e.at) continue;
    byMonth.set(monthStart(e.at), e); // clé = 1er du mois ; dernier gagne
  }
  const chrono = [...byMonth.entries()]
    .map(([start, e]) => ({ e, start }))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // Début de la facturation Pennylane : l'état live si on l'a, sinon le dernier
  // tampon enregistré. C'est là que l'historique commence.
  const liveSub = live?.pennylane?.subscriptionId ? live.pennylane : null;
  const liveOk = liveSub ? live!.rows.every((r) => r.qtyDiff === 0 && !r.priceMismatch) : null;
  const stampedStart = [...chrono].reverse().find((r) => r.e.pennylane?.start)?.e.pennylane?.start ?? null;

  /**
   * Le paiement du mois, vu de Pennylane (admins) : la ou les factures émises
   * ce mois-là, ou « manquante » si une était attendue. Une facture
   * trimestrielle couvre trois mois : les deux suivants renvoient à elle.
   */
  const paymentOfMonth = (monthIso: string): { invoices: InvoiceSummary[]; missing: boolean; coveredBy?: string } | null => {
    if (!live) return null;
    const key = monthKey(monthIso);
    const expected = live.months.find((m) => monthKey(m.month) === key);
    if (expected) return { invoices: expected.invoices, missing: expected.missing };
    const inMonth = live.invoices.filter((i) => i.date && monthKey(i.date) === key && i.state !== "annulee");
    if (inMonth.length) return { invoices: inMonth, missing: false };
    // Pas de facture attendue ce mois-ci : la dernière facture émise avant le couvre.
    const before = live.months.filter((m) => Date.parse(m.month) < Date.parse(monthIso)).pop();
    return before && !before.missing ? { invoices: [], missing: false, coveredBy: before.month } : null;
  };
  const billingStart = live ? (liveSub?.start ?? null) : stampedStart;
  const startMs = billingStart ? Date.parse(billingStart) : null;

  // Une période qui se termine avant le début de la facturation ne compte pas ;
  // la première qui la chevauche démarre AU jour de la première facture.
  const nowKey = monthKey(now);
  const rows = chrono
    .map((row, i) => {
      const nextStart = chrono[i + 1]?.start;
      const endsBefore = startMs != null && nextStart != null && Date.parse(nextStart) <= startMs;
      if (endsBefore) return null;
      const start = startMs != null && Date.parse(row.start) < startMs ? billingStart! : row.start;
      const isCurrent = monthKey(row.start) === nowKey && i === chrono.length - 1;
      const ok = isCurrent && live ? liveOk : (row.e.pennylane?.ok ?? null);
      return { e: row.e, start, end: endLabel(nextStart), ok, liveStamp: isCurrent && Boolean(live), pay: paymentOfMonth(row.start) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .reverse();
  const notStarted = startMs != null && startMs > now.getTime();

  const open = openIdx != null ? rows[openIdx] : null;

  return (
    <div className="cli-history">
      <h4 className="cli-history__title">Historique des montants (facturation mensuelle)</h4>
      {loading ? (
        <p className="cli-history__empty">Chargement…</p>
      ) : billingStart == null ? (
        <p className="cli-history__empty">
          L&apos;historique démarre avec la facturation Pennylane — aucun abonnement pour cette fiche pour l&apos;instant.
        </p>
      ) : notStarted ? (
        <p className="cli-history__empty">
          La facturation Pennylane démarre le <strong>{fmtDay(billingStart)}</strong> : l&apos;historique commencera avec
          cette première facture.
        </p>
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
              {live && <th>Paiement</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.start}-${i}`} className="cli-history__row" onClick={() => setOpenIdx(i)}>
                <td>
                  <span className="cli-history__month">
                    {fmtMonth(row.start)}
                    <StampBadge ok={row.ok} live={row.liveStamp} />
                  </span>
                  <span className="cli-history__range">
                    du {fmtDay(row.start)} au {row.end}
                  </span>
                </td>
                <td className="lic-num">{row.e.totalLicences ?? 0}</td>
                <td className="lic-num">{eur.format(row.e.caHT ?? 0)}</td>
                <td className="lic-num cli-history__commission">{eur.format(row.e.commission ?? 0)}</td>
                {live && (
                  <td className="cli-history__pay">
                    {!row.pay ? (
                      <span className="cli-history__pay-none">—</span>
                    ) : row.pay.missing ? (
                      <span className="bil-pay bil-pay--retard">Aucune facture</span>
                    ) : row.pay.coveredBy ? (
                      <span className="cli-history__pay-none">couvert par la facture de {fmtMonth(row.pay.coveredBy)}</span>
                    ) : (
                      row.pay.invoices.map((inv) => (
                        <span key={inv.id} className="cli-history__pay-line">
                          <PaymentBadge state={inv.state} lateDays={inv.lateDays} />
                          <span className="cli-history__pay-num">{inv.number}</span>
                        </span>
                      ))
                    )}
                  </td>
                )}
                <td className="lic-num cli-history__chevron">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {billingStart != null && !notStarted && (
        <p className="cli-history__note">
          Une ligne par mois, à partir de la première facture Pennylane ({fmtDay(billingStart)}). Cliquez une période
          pour voir le détail des prix. Le tableau se rafraîchit au rechargement de la fiche.
        </p>
      )}

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
