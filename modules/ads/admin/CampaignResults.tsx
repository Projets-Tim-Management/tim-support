import type { Payload } from "payload";

import { eur } from "./format";

/**
 * Campagne › Résultats (tri du 20/10/2026) : ce que la campagne a produit chez
 * la régie, en totaux puis jour par jour — les lignes « campagne » de
 * `ad-metrics-daily` écrites par la synchro. La liste brute des métriques est
 * sortie du menu : c'est ici qu'on les lit. Server component, lu à l'ouverture.
 */

type Row = { day: string; spend?: number | null; impressions?: number | null; clicks?: number | null; leads?: number | null };

const DAYS = 30;
const int = (n: number) => n.toLocaleString("fr-FR");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %` : "—");
const per = (a: number, b: number) => (b > 0 ? eur(a / b) : "—");
const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });

export async function CampaignResults({ payload, data }: { payload: Payload; data?: { externalId?: string | null; platform?: string | null } | null }) {
  const externalId = data?.externalId;
  if (!externalId) {
    return <p className="ads-results__empty">Pas encore de résultats : la campagne n&apos;est pas publiée chez la régie (onglet « Diffusion »).</p>;
  }
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString().slice(0, 10);
  const res = await payload.find({
    collection: "ad-metrics-daily",
    where: { and: [{ level: { equals: "campaign" } }, { externalId: { equals: externalId } }, { day: { greater_than_equal: since } }] },
    sort: "-day",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const rows = res.docs as unknown as Row[];
  if (!rows.length) {
    return <p className="ads-results__empty">Pas encore de chiffres : la synchro lit la régie une fois par jour, les premiers arrivent le lendemain de l&apos;activation.</p>;
  }
  const n = (r: Row, k: keyof Omit<Row, "day">) => Number(r[k] ?? 0);
  const sum = (k: keyof Omit<Row, "day">) => rows.reduce((s, r) => s + n(r, k), 0);
  const t = { spend: sum("spend"), impressions: sum("impressions"), clicks: sum("clicks"), leads: sum("leads") };
  return (
    <section className="ads-results">
      <div className="ads-results__kpis">
        <div><span>Dépensé</span><strong>{eur(t.spend)}</strong></div>
        <div><span>Impressions</span><strong>{int(t.impressions)}</strong></div>
        <div><span>Clics</span><strong>{int(t.clicks)}</strong><small>{pct(t.clicks, t.impressions)} de clics</small></div>
        <div><span>Coût par clic</span><strong>{per(t.spend, t.clicks)}</strong></div>
        <div><span>Leads</span><strong>{int(t.leads)}</strong><small>{per(t.spend, t.leads)} par lead</small></div>
      </div>
      <table className="ads-results__table">
        <caption>{DAYS} derniers jours, du plus récent au plus ancien</caption>
        <thead>
          <tr><th scope="col">Jour</th><th scope="col">Dépense</th><th scope="col">Impressions</th><th scope="col">Clics</th><th scope="col">Taux de clic</th><th scope="col">Leads</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{dayLabel(r.day)}</th>
              <td>{eur(n(r, "spend"))}</td>
              <td>{int(n(r, "impressions"))}</td>
              <td>{int(n(r, "clicks"))}</td>
              <td>{pct(n(r, "clicks"), n(r, "impressions"))}</td>
              <td>{int(n(r, "leads"))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default CampaignResults;
