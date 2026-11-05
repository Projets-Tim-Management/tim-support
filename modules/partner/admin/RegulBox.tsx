"use client";

import { useState } from "react";

import { frDate } from "@/core/lib/dates";
import type { ClientCheck } from "@/modules/partner/lib/billing-check";
import { eur } from "@/modules/partner/lib/format";
import { perMonthText, type Regularisation } from "@/modules/partner/lib/regularisation";

/**
 * La régularisation d'un client facturé sur plusieurs mois (trimestre…) :
 * ce qu'il doit en plus pour la période déjà facturée, et ce qu'il faut
 * recopier dans Pennylane. Calcul : lib/regularisation.ts.
 *
 * Rien à cocher ici : la régularisation se constate. Posée sur l'abonnement
 * (ligne « Régularisation… »), elle passe « prévue » ; une fois la facture
 * émise, le contrôle la retrouve (« facturée ») ou la signale (« manquante »).
 */


const STATE: Record<Regularisation["state"], { label: string; tone: string }> = {
  "a-facturer": { label: "À ajouter sur la prochaine facture", tone: "warn" },
  prevue: { label: "Prévue sur l'abonnement Pennylane", tone: "ok" },
  facturee: { label: "Facturée", tone: "ok" },
  manquante: { label: "Non retrouvée sur les factures", tone: "error" },
};

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="bil-regul__copy"
      onClick={() =>
        void navigator.clipboard?.writeText(text)?.then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? "Copié ✓" : "Copier"}
    </button>
  );
}

function Period({ r, title }: { r: Regularisation; title: string }) {
  const state = STATE[r.state];
  return (
    <section className={`bil-regul bil-regul--${state.tone}`}>
      <header className="bil-regul__head">
        <h4 className="bil-regul__title">{title}</h4>
        <span className={`bil-regul__state bil-regul__state--${state.tone}`}>{state.label}</span>
        <span className="bil-regul__amount">{eur.format(r.amountHT)} HT</span>
      </header>
      <p className="bil-regul__period">
        Période du {frDate(r.periodStart, "long")} au {frDate(r.lastDay, "long")}, payée d&apos;avance · à facturer avec la facture du <strong>{frDate(r.periodEnd, "long")}</strong>
      </p>
      <table className="bil-table">
        <thead>
          <tr>
            <th>Licence</th>
            <th>En plus, mois par mois</th>
            <th className="bil-num">Licences-mois</th>
            <th className="bil-num">Prix HT</th>
            <th className="bil-num">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.profile}>
              <td className="bil-profil">{l.label}</td>
              <td>{perMonthText(l, r.periodStart)}</td>
              <td className="bil-num">{l.licenceMonths}</td>
              <td className="bil-num">{eur.format(l.unitPrice)}</td>
              <td className="bil-num">{eur.format(l.amountHT)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(r.state === "a-facturer" || r.state === "manquante") && (
        <div className="bil-regul__todo">
          <p>
            À ajouter dans Pennylane sur la facture du {frDate(r.periodEnd, "long")} (ou en facture à part), une ligne par licence. Gardez le mot
            «&nbsp;Régularisation&nbsp;» dans le libellé : c&apos;est à lui que le contrôle la retrouve.
          </p>
          <ul>
            {r.pennylaneLines.map((l) => (
              <li key={l.label}>
                <span>
                  {l.label} — <strong>{l.qty}</strong> × {eur.format(l.unitPrice)} HT
                </span>
                <CopyButton text={l.label} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function RegulBox({ check }: { check: ClientCheck }) {
  const { current, previous } = check.regularisation;
  if (!current && !previous) return null;
  return (
    <div className="bil-reguls">
      {current && <Period r={current} title="Régularisation de la période en cours" />}
      {previous && previous.state === "manquante" && <Period r={previous} title="Régularisation de la période précédente" />}
      {previous && previous.state === "facturee" && (
        <p className="bil-muted">
          Période précédente : régularisation de {eur.format(previous.amountHT)} HT retrouvée sur les factures du {frDate(previous.periodEnd, "long")}.
        </p>
      )}
    </div>
  );
}
