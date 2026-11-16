"use client";

import { Children, useState } from "react";

/**
 * Les onglets de la fiche d'un chef (14/11/2026) : au lieu d'empiler la fiche
 * des canaux, la maîtrise, la méthode, les campagnes, le budget et le fil, on
 * n'en montre qu'un à la fois — l'essentiel tient au-dessus, en chiffres.
 *
 * Les contenus sont rendus par le serveur et passés en enfants, dans l'ordre
 * des onglets ; on ne fait que montrer celui qui est choisi.
 */
export type FicheTab = { key: string; label: string; badge?: number };

export function FicheTabs({ tabs, initial, children }: { tabs: FicheTab[]; initial?: string; children: React.ReactNode }) {
  const [active, setActive] = useState(tabs.some((t) => t.key === initial) ? initial! : (tabs[0]?.key ?? ""));
  const panes = Children.toArray(children);
  const index = Math.max(0, tabs.findIndex((t) => t.key === active));
  return (
    <div className="ait-tabs">
      <div className="ait-tabs__list" role="tablist" aria-label="Le détail">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`ait-tab-${t.key}`} aria-selected={t.key === active} aria-controls={`ait-pane-${t.key}`} className={`ait-tabs__tab${t.key === active ? " ait-tabs__tab--on" : ""}`} onClick={() => setActive(t.key)}>
            {t.label}
            {t.badge ? <span className="ait-tabs__badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="ait-tabs__pane" role="tabpanel" id={`ait-pane-${tabs[index]?.key}`} aria-labelledby={`ait-tab-${tabs[index]?.key}`}>
        {panes[index]}
      </div>
    </div>
  );
}
