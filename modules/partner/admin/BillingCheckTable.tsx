import { PaymentBadge } from "@/modules/partner/admin/BillingCells";
import { BillingRows } from "@/modules/partner/admin/BillingRows";
import type { ClientCheck } from "@/modules/partner/lib/billing-check";
import { plPaymentLabel, plStatusLabel } from "@/modules/partner/lib/billing-check";
import { monthsLabel } from "@/modules/partner/lib/billing-period";
import { eur } from "@/modules/partner/lib/format";

/**
 * Le détail d'un contrôle : les constats, l'abonnement Pennylane, le tableau
 * profil par profil (BillingRows), puis les factures.
 *
 * Partagé entre l'écran global (dans chaque ligne dépliée, éditable) et la
 * fiche client (sous le tableau des licences, en lecture).
 */

const VERDICT_LABEL: Record<ClientCheck["verdict"], string> = {
  ok: "Conforme",
  ecart: "Écart",
  "sans-abonnement": "Sans abonnement",
  "non-rapproche": "Introuvable",
};

export function VerdictBadge({ verdict }: { verdict: ClientCheck["verdict"] }) {
  return <span className={`bil-badge bil-badge--${verdict}`}>{VERDICT_LABEL[verdict]}</span>;
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/**
 * `editable` : la fiche se corrige DANS l'encart (écran de rapprochement). Sur
 * la fiche client, le formulaire est juste au-dessus — lecture seule ici.
 */
export function BillingCheckDetail({ check, editable = false }: { check: ClientCheck; editable?: boolean }) {
  const pl = check.pennylane;
  return (
    <div className="bil-detail">
      {check.issues.length > 0 && (
        <ul className="bil-issues">
          {check.issues.map((i, n) => (
            <li key={n} className={`bil-issue bil-issue--${i.severity}`}>
              {i.label}
            </li>
          ))}
        </ul>
      )}

      {pl && (
        <dl className="bil-facts">
          <div>
            <dt>Client Pennylane</dt>
            <dd>
              {pl.customerName}
              {pl.regNo && <span className="bil-muted"> · {pl.regNo}</span>}
            </dd>
          </div>
          <div>
            <dt>Abonnement</dt>
            <dd>
              {pl.subscriptionId ? (
                <>
                  {plStatusLabel(pl.status)}
                  {pl.subscriptionLabel && <span className="bil-muted"> · {pl.subscriptionLabel}</span>}
                </>
              ) : (
                "aucun"
              )}
            </dd>
          </div>
          {pl.subscriptionId && (
            <>
              <div>
                <dt>Prochaine facture</dt>
                <dd>{fmtDate(pl.nextOccurrence)}</dd>
              </div>
              <div>
                <dt>Paiement</dt>
                <dd>{plPaymentLabel(pl.paymentMethod)}</dd>
              </div>
              <div>
                <dt>Facturé</dt>
                <dd>
                  {pl.months == null ? "récurrence inconnue" : monthsLabel(pl.months)}
                  {pl.months != null && pl.months > 1 && (
                    <span className="bil-muted"> · {eur.format(pl.amountHT)} HT par facture</span>
                  )}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}

      {(editable || pl?.subscriptionId || check.totals.supportQty > 0) && (
        <BillingRows key={check.client.id} check={check} editable={editable} />
      )}

      {check.invoices.length > 0 && <Invoices check={check} />}
    </div>
  );
}

/**
 * Les factures émises pour ce client, les plus récentes d'abord — et, entre
 * elles, les mois attendus où rien n'a été émis. C'est la liste qu'on parcourt
 * pour vérifier qu'aucun paiement ne manque.
 */
function Invoices({ check }: { check: ClientCheck }) {
  const missing = check.months.filter((m) => m.missing);
  return (
    <div className="bil-invoices">
      <h4 className="bil-invoices__title">
        Factures
        {check.latePayments.length > 0 && (
          <span className="bil-count bil-count--error">{check.latePayments.length} en retard</span>
        )}
      </h4>
      <table className="bil-table">
        <thead>
          <tr>
            <th>Facture</th>
            <th>Date</th>
            <th>Échéance</th>
            <th className="bil-num">Montant TTC</th>
            <th className="bil-num">Reste dû</th>
            <th>Paiement</th>
          </tr>
        </thead>
        <tbody>
          {missing.map((m) => (
            <tr key={`m-${m.month}`} className="bil-row--qty">
              <td className="bil-profil" colSpan={5}>
                Aucune facture émise en{" "}
                {new Date(m.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </td>
              <td>
                <span className="bil-pay bil-pay--retard">Manquante</span>
              </td>
            </tr>
          ))}
          {check.invoices.slice(0, 12).map((inv) => (
            <tr key={inv.id} className={inv.state === "retard" ? "bil-row--qty" : ""}>
              <td className="bil-profil">
                {inv.url ? (
                  <a href={inv.url} target="_blank" rel="noreferrer" className="bil-invoices__link">
                    {inv.number}
                  </a>
                ) : (
                  inv.number
                )}
              </td>
              <td>{fmtDate(inv.date)}</td>
              <td>{fmtDate(inv.deadline)}</td>
              <td className="bil-num">{eur.format(inv.amountTTC)}</td>
              <td className="bil-num">{inv.remaining > 0 ? eur.format(inv.remaining) : "—"}</td>
              <td>
                <PaymentBadge state={inv.state} lateDays={inv.lateDays} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {check.invoices.length > 12 && (
        <p className="bil-muted bil-invoices__more">Les 12 dernières factures sont affichées.</p>
      )}
    </div>
  );
}
