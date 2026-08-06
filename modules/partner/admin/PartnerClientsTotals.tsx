"use client";

import { useListQuery } from "@payloadcms/ui";
import { stringify } from "qs-esm";
import { useEffect, useState } from "react";

import { eur, round2 } from "@/modules/partner/lib/format";
import { isBillableClient } from "@/modules/partner/lib/pricing";

/**
 * Ligne de TOTAL sous la liste « Clients apportés » (slot `afterListTable`) :
 * somme du CA mensuel et des commissions.
 *
 * Le total porte sur TOUS les clients du filtre courant, pas sur la seule page
 * affichée : on refait donc la requête avec le même `where` et `limit=0` (tout),
 * plutôt que d'additionner `data.docs` — qui n'aurait donné que la page en cours,
 * un total faux dès la 2ᵉ page.
 */

type Row = { caPaye?: number; commissionMonthly?: number; clientStatus?: string };

export function PartnerClientsTotals() {
  const { data, query } = useListQuery();
  const [rows, setRows] = useState<Row[] | null>(null);

  // Signature du filtre : relance la somme quand le filtre/la recherche change
  // (et non à chaque changement de page, qui ne modifie pas le total).
  const where = query?.where;
  const search = typeof query?.search === "string" ? query.search.trim() : "";
  const filterKey = JSON.stringify({ where, search });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // La recherche de la liste est traduite côté serveur en `where` sur le
      // champ titre : on la reproduit ici pour rester cohérent avec l'affichage.
      const clauses = [where, search ? { companyName: { like: search } } : null].filter(Boolean);
      const qs = stringify(
        {
          depth: 0,
          limit: 0,
          // Seuls ces champs servent au total. Sans `select`, chaque client
          // arrive complet, historique des montants inclus (23 Ko pour 12 clients).
          // ⚠️ `partner` est indispensable : la commission est un champ VIRTUEL
          // calculé à la lecture depuis le taux de la fiche partenaire — sans le
          // lien, le hook ne trouve pas le taux et renvoie 0, donc un total faux.
          // Mesuré : 166 ms / 23 Ko → 22 ms / 1 Ko.
          select: { caPaye: true, commissionMonthly: true, clientStatus: true, partner: true },
          ...(clauses.length ? { where: { and: clauses } } : {}),
        },
        { addQueryPrefix: true },
      );
      try {
        const res = await fetch(`/payload-api/partner-clients${qs}`, { credentials: "include" });
        const json = res.ok ? await res.json() : { docs: [] };
        if (!cancelled) setRows((json?.docs ?? []) as Row[]);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  if (!rows || !data) return null;

  // Seuls les clients ACTIFS sont facturés (voir isBillableClient) : additionner
  // les prospects ou les résiliés donnerait un CA « / mois » jamais encaissé.
  const actifs = rows.filter((r) => isBillableClient(r.clientStatus));
  const ca = round2(actifs.reduce((s, r) => s + (r.caPaye ?? 0), 0));
  const commission = round2(actifs.reduce((s, r) => s + (r.commissionMonthly ?? 0), 0));

  return (
    <div className="tim-clients-total">
      <span className="tim-clients-total__label">
        Total · {actifs.length} client{actifs.length > 1 ? "s" : ""} actif
        {actifs.length > 1 ? "s" : ""}
        {rows.length > actifs.length && (
          <span className="tim-clients-total__hint"> sur {rows.length} affichés</span>
        )}
      </span>
      <span className="tim-clients-total__cell">
        <span className="tim-clients-total__cell-label">CA / mois</span>
        {eur.format(ca)}
      </span>
      <span className="tim-clients-total__cell tim-clients-total__cell--strong">
        <span className="tim-clients-total__cell-label">Commission / mois</span>
        {eur.format(commission)}
      </span>
    </div>
  );
}
