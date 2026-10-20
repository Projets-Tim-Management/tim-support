import Link from "next/link";
import type { Payload } from "payload";

import { AD_SPEND_KINDS } from "@/modules/ads/collections/AdAiUsage";
import { eur, limitsFor, spentOf } from "@/modules/ads/lib/spend";

/**
 * En tête de Publicité › Réglages › Garde-fous : ce que l'IA a coûté ce mois-ci,
 * nature par nature, face au plafond réglé juste en dessous — puis les deux
 * journaux sortis du menu (tri du 20/10/2026) : le détail des dépenses et
 * l'historique des réglages. Server component : lu à l'ouverture de la page.
 */
export async function SpendSummary({ payload }: { payload: Payload }) {
  const settings = await payload.findGlobal({ slug: "ads-settings", depth: 0, overrideAccess: true }).catch(() => null);
  const rows = await Promise.all(
    AD_SPEND_KINDS.map(async ({ label, value }) => {
      const [spent, limits] = [await spentOf(payload, value), limitsFor(value, settings as never)];
      return { label, value, spent: spent.month, cap: limits.month };
    }),
  );
  const total = rows.reduce((s, r) => s + r.spent, 0);
  return (
    <section className="ads-spend">
      <header className="ads-spend__head">
        <strong>Dépenses IA ce mois-ci</strong>
        <span>{eur(total)}</span>
      </header>
      <ul className="ads-spend__list">
        {rows.map((r) => {
          const pct = r.cap > 0 ? Math.min(100, Math.round((r.spent / r.cap) * 100)) : 0;
          return (
            <li key={r.value} className={`ads-spend__row${pct >= 80 ? " ads-spend__row--high" : ""}`}>
              <span className="ads-spend__label">{r.label}</span>
              <span className="ads-spend__bar" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="ads-spend__value">
                {eur(r.spent)} <small>/ {eur(r.cap)}</small>
              </span>
            </li>
          );
        })}
      </ul>
      <nav className="ads-spend__links">
        <Link href="/admin/collections/ad-ai-usage" prefetch={false}>
          Détail des dépenses IA →
        </Link>
        <Link href="/admin/collections/ads-settings-history" prefetch={false}>
          Historique des réglages →
        </Link>
      </nav>
    </section>
  );
}

export default SpendSummary;
