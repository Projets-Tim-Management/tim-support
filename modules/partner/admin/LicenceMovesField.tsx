"use client";

import { useField, useFormFields } from "@payloadcms/ui";

import { dayKey } from "@/core/lib/dates";
import { PROFILS } from "@/modules/partner/lib/pricing";
import { suggestMoveLine, type LicenceMoveDay, type MoveLine } from "@/modules/partner/lib/regularisation";

/**
 * « Mouvements de licences » en tableau compact, dans la graphie du tableau
 * des licences juste au-dessus : UNE LIGNE PAR LICENCE (date · licence ·
 * avant · après · prix), un mouvement = un jour, ses licences les unes sous
 * les autres. Les plus récents en haut.
 *
 * Les mouvements se notent seuls quand on enregistre la fiche (hook
 * computeCA → nextLicenceMoves). Ici on corrige une date, ou on ajoute un
 * changement passé ; une licence ajoutée à la main se préremplit avec ce que
 * la fiche sait déjà (suggestMoveLine).
 */

/** Midi UTC : le jour choisi reste le même jour à Paris, été comme hiver. */
const atOf = (day: string) => `${day}T12:00:00.000Z`;
const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const emptyLine = (): MoveLine => ({ profile: "", before: null, after: null, price: null });

type FormCtx = { licences: Record<string, number>; history: { at?: string; detail?: unknown }[] };

export function LicenceMovesField() {
  const { value, setValue } = useField<LicenceMoveDay[] | null>({ path: "licenceMoves" });
  const days: LicenceMoveDay[] = Array.isArray(value) ? value.filter((d) => d && Array.isArray(d.lines)) : [];

  // Ce dont le préremplissage a besoin : l'historique mensuel et les licences actuelles.
  const ctx = useFormFields(([fields]) => {
    const licences: Record<string, number> = {};
    const history: { at?: string; detail?: unknown }[] = [];
    for (const [p, f] of Object.entries(fields)) {
      const l = /^licences\.(\w+)$/.exec(p);
      if (l) licences[l[1]] = Number(f?.value ?? 0);
      const h = /^history\.(\d+)\.(at|detail)$/.exec(p);
      if (h) history[Number(h[1])] = { ...(history[Number(h[1])] ?? {}), [h[2]]: f?.value };
    }
    return JSON.stringify({ licences, history: history.filter(Boolean) } satisfies FormCtx);
  });

  /** Un mouvement sans licence n'a pas de sens : il disparaît. */
  const write = (next: LicenceMoveDay[]) => setValue(next.filter((d) => d.lines.length > 0));
  const patchDay = (i: number, p: Partial<LicenceMoveDay>) => write(days.map((d, k) => (k === i ? { ...d, ...p } : d)));
  const patchLine = (i: number, j: number, p: Partial<MoveLine>) => patchDay(i, { lines: days[i].lines.map((l, k) => (k === j ? { ...l, ...p } : l)) });

  /** Choisir la licence d'une ligne neuve : avant / après / prix se remplissent. */
  const chooseProfile = (i: number, j: number, profile: string) => {
    const { licences, history } = JSON.parse(ctx) as FormCtx;
    const line = days[i].lines[j];
    const fresh = line.before == null && line.after == null;
    const s = fresh && profile ? suggestMoveLine({ days, dayIndex: i, profile, at: days[i].at, history, licences }) : null;
    patchLine(i, j, { profile, ...(s ? { before: s.before, after: s.after, price: s.price } : {}) });
  };

  const addDay = () => write([...days, { at: atOf(dayKey(new Date())), lines: [emptyLine()] }]);
  const addLine = (i: number) => patchDay(i, { lines: [...days[i].lines, emptyLine()] });
  const removeLine = (i: number, j: number) => patchDay(i, { lines: days[i].lines.filter((_, k) => k !== j) });

  // Affichage : les plus récents en haut, sans toucher à l'ordre enregistré (les index restent ceux de `days`).
  const order = days.map((d, i) => ({ d, i })).sort((a, b) => dayKey(b.d.at).localeCompare(dayKey(a.d.at)));
  /** Une licence ne figure qu'une fois par mouvement : les autres lignes du jour la retirent du choix. */
  const taken = (i: number, j: number) => new Set(days[i].lines.filter((_, k) => k !== j).map((l) => l.profile));

  return (
    <div className="field-type lic-moves">
      <div className="lic-moves__head">
        <span className="lic-moves__title">Mouvements de licences</span>
        <span className="lic-moves__hint">Notés seuls à l&apos;enregistrement · tout mois commencé est dû, pas d&apos;avoir</span>
      </div>
      <div className="lic-moves__scroll">
        <table className="lic-table lic-moves__table">
          <thead>
            <tr>
              <th>Date d&apos;effet</th>
              <th>Licence</th>
              <th className="lic-num">Avant</th>
              <th className="lic-num">Après</th>
              <th className="lic-num">Écart</th>
              <th className="lic-num">Prix € HT / mois</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {order.length === 0 && (
              <tr>
                <td colSpan={7} className="lic-moves__empty">
                  Aucun mouvement. Ils se notent seuls quand vous changez une quantité et enregistrez la fiche.
                </td>
              </tr>
            )}
            {order.map(({ d, i }) =>
              d.lines.map((l, j) => {
                const delta = l.before != null && l.after != null ? l.after - l.before : null;
                const first = j === 0;
                const last = j === d.lines.length - 1;
                return (
                  <tr key={`${i}.${j}`} className={`lic-moves__row${first ? " lic-moves__row--first" : ""}`}>
                    <td>
                      {first && (
                        <input
                          type="date"
                          className="lic-input lic-moves__date"
                          value={dayKey(d.at)}
                          aria-label="Date d'effet du mouvement"
                          onChange={(e) => e.target.value && patchDay(i, { at: atOf(e.target.value) })}
                        />
                      )}
                    </td>
                    <td>
                      <select className="lic-input lic-moves__profile" value={l.profile} aria-label="Licence" onChange={(e) => chooseProfile(i, j, e.target.value)}>
                        <option value="">Choisir…</option>
                        {PROFILS.filter((p) => p.key === l.profile || !taken(i, j).has(p.key)).map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="lic-num">
                      <input type="number" min={0} className="lic-input" aria-label="Avant" value={l.before ?? ""} onChange={(e) => patchLine(i, j, { before: num(e.target.value) })} />
                    </td>
                    <td className="lic-num">
                      <input type="number" min={0} className="lic-input" aria-label="Après" value={l.after ?? ""} onChange={(e) => patchLine(i, j, { after: num(e.target.value) })} />
                    </td>
                    <td className={`lic-num lic-moves__delta${delta && delta > 0 ? " is-up" : delta && delta < 0 ? " is-down" : ""}`}>{delta == null || delta === 0 ? "—" : delta > 0 ? `+${delta}` : delta}</td>
                    <td className="lic-num">
                      <input type="number" min={0} step={0.01} className="lic-input" aria-label="Prix" value={l.price ?? ""} placeholder="—" onChange={(e) => patchLine(i, j, { price: num(e.target.value) })} />
                    </td>
                    <td className="lic-moves__actions">
                      <button type="button" className="lic-moves__icon" aria-label="Retirer cette licence du mouvement" title="Retirer" onClick={() => removeLine(i, j)}>
                        ✕
                      </button>
                      {last && (
                        <button type="button" className="lic-moves__link" onClick={() => addLine(i)}>
                          + licence
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <div className="lic-moves__foot">
        <button type="button" className="lic-moves__add" onClick={addDay}>
          + Nouveau mouvement
        </button>
      </div>
    </div>
  );
}
