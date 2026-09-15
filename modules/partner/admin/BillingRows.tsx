"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Diff, PlQty, Price } from "@/modules/partner/admin/BillingCells";
import { DiscountControl } from "@/modules/partner/admin/DiscountControl";
import type {
  ClientCheck,
  ProfileRow,
} from "@/modules/partner/lib/billing-check";
import { eur, round2 } from "@/modules/partner/lib/format";
import {
  effectiveUnitPrice,
  PROFILS,
  type ProfilKey,
} from "@/modules/partner/lib/pricing";

/**
 * Le tableau profil par profil d'un encart (fiche · Pennylane · écart · prix).
 *
 * En lecture (fiche client, où le formulaire est juste au-dessus), il montre.
 * Éditable (écran de rapprochement), les colonnes « Fiche » (quantité) et
 * « Prix fiche » deviennent des champs : on corrige ici, l'écart se recalcule
 * pendant qu'on tape, et « Enregistrer » écrit sur la fiche client sans avoir à
 * l'ouvrir. « Aligner sur Pennylane » recopie ce qui est facturé dans les
 * champs (rien n'est enregistré tant qu'on n'a pas cliqué « Enregistrer »).
 *
 * Le côté Pennylane, lui, ne se modifie que dans Pennylane.
 */

type Line = { qty: number; price: number; pct: number; amount: number };
type Draft = Record<ProfilKey, Line>;

/** Le prix saisi (avant remise) : c'est lui qu'on édite, la remise à part. */
const fromRows = (rows: ProfileRow[]): Draft =>
  Object.fromEntries(
    rows.map((r) => [
      r.key,
      {
        qty: r.supportQty,
        price: r.supportListPrice,
        pct: r.supportDiscountPct,
        amount: r.supportDiscountAmount,
      },
    ]),
  ) as Draft;

const net = (l: Line) =>
  effectiveUnitPrice({
    price: l.price,
    discountPct: l.pct,
    discountAmount: l.amount,
  });

const same = (a: Draft, b: Draft) =>
  PROFILS.every((p) =>
    (["qty", "price", "pct", "amount"] as const).every(
      (f) => a[p.key][f] === b[p.key][f],
    ),
  );

export function BillingRows({
  check,
  editable = false,
}: {
  check: ClientCheck;
  editable?: boolean;
}) {
  const router = useRouter();
  const initial = fromRows(check.rows);
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const dirty = editable && !same(draft, initial);

  const set = (key: ProfilKey, field: "qty" | "price", raw: string) =>
    setDraft((d) => ({
      ...d,
      [key]: { ...d[key], [field]: raw === "" ? 0 : Number(raw) },
    }));

  /**
   * Recopie ce que Pennylane facture : quantité, prix catalogue et remise,
   * profil par profil. Une remise Pennylane en € porte sur la ligne entière ;
   * ramenée à la licence, elle devient l'écart entre prix catalogue et prix
   * effectif — c'est ce que la fiche sait exprimer.
   */
  const alignOnPennylane = () =>
    setDraft(
      Object.fromEntries(
        check.rows.map((r) => {
          const cur = draft[r.key];
          if (r.plQty === 0 || r.plPrice == null || r.mixedPrices)
            return [r.key, { ...cur, qty: r.plQty }];
          const list = r.plListPrice ?? r.plPrice;
          const off = round2(list - r.plPrice);
          return [
            r.key,
            { qty: r.plQty, price: list, pct: 0, amount: off > 0 ? off : 0 },
          ];
        }),
      ) as Draft,
    );

  const save = async () => {
    setState("saving");
    const licences: Record<string, number> = {};
    for (const p of PROFILS) {
      licences[`${p.key}Qty`] = draft[p.key].qty;
      licences[`${p.key}Price`] = draft[p.key].price;
      licences[`${p.key}DiscountPct`] = draft[p.key].pct;
      licences[`${p.key}DiscountAmount`] = draft[p.key].amount;
    }
    try {
      const res = await fetch(
        `/payload-api/partner-clients/${check.client.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ licences }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      setState("saved");
      // Le rapport est calculé côté serveur : on le lui redemande, l'instantané
      // Pennylane restant en cache — seule la fiche a changé.
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  // Les profils absents des deux côtés n'apprennent rien — sauf si on vient
  // d'en saisir un : il doit rester visible pour être enregistré.
  const shown = check.rows.filter(
    (r) => r.supportQty > 0 || r.plQty > 0 || draft[r.key].qty > 0,
  );
  const hidden = check.rows.filter((r) => !shown.includes(r));

  const totals = check.rows.reduce(
    (t, r) => ({
      supportQty: t.supportQty + draft[r.key].qty,
      supportHT: round2(t.supportHT + draft[r.key].qty * net(draft[r.key])),
      plQty: t.plQty + r.plQty,
    }),
    { supportQty: 0, supportHT: 0, plQty: 0 },
  );
  const plHT = check.totals.plHT;
  const hasPl = Boolean(check.pennylane?.subscriptionId);

  return (
    <div className="bil-rows">
      <table className={`bil-table${editable ? " bil-table--edit" : ""}`}>
        <thead>
          <tr>
            <th>Profil</th>
            <th className="bil-num">Fiche</th>
            <th className="bil-num">Pennylane</th>
            <th className="bil-num">Écart</th>
            <th className="bil-num">Prix fiche</th>
            <th className="bil-num">Prix Pennylane</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const d = draft[r.key];
            const qtyDiff = r.plQty - d.qty;
            const priceFlag =
              d.qty > 0 &&
              r.plQty > 0 &&
              (r.mixedPrices || net(d) !== round2(r.plPrice ?? 0));
            return (
              <tr
                key={r.key}
                className={
                  qtyDiff !== 0
                    ? "bil-row--qty"
                    : priceFlag
                      ? "bil-row--price"
                      : ""
                }
              >
                <td className="bil-profil">{r.label}</td>
                <td className="bil-num">
                  {editable ? (
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="bil-input"
                      value={d.qty === 0 ? "" : d.qty}
                      placeholder="0"
                      onChange={(e) => set(r.key, "qty", e.target.value)}
                    />
                  ) : (
                    d.qty
                  )}
                </td>
                <td className="bil-num">
                  <PlQty qty={r.plQty} lines={r.plLines} />
                </td>
                <td className="bil-num">
                  <Diff n={qtyDiff} />
                </td>
                <td className="bil-num">
                  {editable ? (
                    <span className="lic-price">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="bil-input"
                        value={d.price === 0 ? "" : d.price}
                        placeholder="0"
                        onChange={(e) => set(r.key, "price", e.target.value)}
                      />
                      <DiscountControl
                        price={d.price}
                        value={{ pct: d.pct, amount: d.amount }}
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            [r.key]: {
                              ...prev[r.key],
                              pct: v.pct,
                              amount: v.amount,
                            },
                          }))
                        }
                        disabled={state === "saving"}
                      />
                    </span>
                  ) : (
                    <Price value={d.qty > 0 ? net(d) : null} list={d.price} />
                  )}
                </td>
                <td className="bil-num">
                  <Price
                    value={r.plPrice}
                    list={r.plListPrice}
                    mixed={r.mixedPrices}
                    flag={priceFlag}
                  />
                </td>
              </tr>
            );
          })}
          {check.extraLines.map((l, i) => (
            <tr key={`x${i}`} className="bil-row--extra">
              <td className="bil-profil">
                {l.label} <span className="bil-tag">hors licences</span>
              </td>
              <td className="bil-num">—</td>
              <td className="bil-num">{l.qty}</td>
              <td className="bil-num" />
              <td className="bil-num" />
              <td className="bil-num">{eur.format(l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bil-total">
            <td>Total HT / mois</td>
            <td className="bil-num">{totals.supportQty}</td>
            <td className="bil-num">{totals.plQty}</td>
            <td className="bil-num">
              <Diff n={totals.plQty - totals.supportQty} />
            </td>
            <td className="bil-num">{eur.format(totals.supportHT)}</td>
            <td
              className={`bil-num${hasPl && totals.supportHT !== plHT ? " bil-price--flag" : ""}`}
            >
              {hasPl ? eur.format(plHT) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      {editable && (
        <div className="bil-edit-bar">
          {hidden.length > 0 && (
            <select
              className="bil-edit-bar__add"
              value=""
              onChange={(e) => {
                const key = e.target.value as ProfilKey;
                if (key) set(key, "qty", "1");
              }}
            >
              <option value="">Ajouter un profil…</option>
              {hidden.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          <span className="bil-edit-bar__spacer" />
          {hasPl && (
            <button
              type="button"
              className="bil-btn"
              onClick={alignOnPennylane}
              disabled={state === "saving"}
            >
              Aligner sur Pennylane
            </button>
          )}
          {dirty && (
            <button
              type="button"
              className="bil-btn"
              onClick={() => setDraft(initial)}
              disabled={state === "saving"}
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            className="bil-btn bil-btn--primary"
            onClick={save}
            disabled={!dirty || state === "saving"}
          >
            {state === "saving"
              ? "Enregistrement…"
              : state === "saved"
                ? "Enregistré"
                : "Enregistrer la fiche"}
          </button>
          {state === "error" && (
            <span className="bil-edit-bar__error">
              Enregistrement impossible.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
