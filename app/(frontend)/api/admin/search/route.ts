import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";

import { hasAdminRole, isSupport } from "@/core/access";
import {
  MIN_QUERY,
  SEARCHABLE,
  contactsWhere,
  filterPages,
  hiddenFor,
  labelOf,
  mapLimit,
  normalizeQuery,
  selectFor,
  whereFor,
  type PageHit,
  type RecordHit,
} from "@/core/lib/global-search";
import { payloadClient } from "@/core/payload-client";

/**
 * Recherche globale de la barre du haut : « aller quelque part » en tapant.
 *
 * Deux familles de résultats, dans cet ordre :
 *   - les PAGES (tableau de bord, vues custom, listes de collections) que le
 *     menu montre à cette personne — même règle que la nav : `admin.hidden`
 *     évalué pour l'utilisateur + permission de lecture ;
 *   - les FICHES des collections qu'on ouvre tous les jours, cherchées via
 *     `payload.find` SANS `overrideAccess` : chaque rôle ne retrouve que ce
 *     qu'il a le droit de lire, les règles d'accès des collections font foi.
 *
 * Sans terme, on renvoie seulement les pages : le champ sert alors de menu
 * rapide. Avec un terme, pages filtrées + fiches.
 */

export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user, permissions } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const q = normalizeQuery(new URL(req.url).searchParams.get("q"));
  const admin = payload.config.routes.admin;
  const collections = new Map(payload.config.collections.map((c) => [c.slug, c]));

  // ── Pages ────────────────────────────────────────────────────────────────
  const pages: PageHit[] = [{ label: "Tableau de bord", href: admin }];
  if (hasAdminRole(user) || isSupport(user)) {
    pages.push({ label: "Notifications", href: `${admin}/notifications`, group: "Support" });
  }
  if (hasAdminRole(user)) {
    pages.push({ label: "Acquisition", href: `${admin}/acquisition`, group: "Marketing" });
  }
  for (const c of collections.values()) {
    if (hiddenFor(c.admin?.hidden, user)) continue;
    if (!permissions.collections?.[c.slug]?.read) continue;
    pages.push({
      label: labelOf(c.labels?.plural, c.slug),
      href: `${admin}/collections/${c.slug}`,
      group: typeof c.admin?.group === "string" ? c.admin.group : undefined,
    });
  }
  for (const g of payload.config.globals) {
    if (hiddenFor(g.admin?.hidden, user)) continue;
    if (!permissions.globals?.[g.slug]?.read) continue;
    pages.push({
      label: labelOf(g.label, g.slug),
      href: `${admin}/globals/${g.slug}`,
      group: typeof g.admin?.group === "string" ? g.admin.group : undefined,
    });
  }

  if (!q) return NextResponse.json({ pages, records: [] });
  const matchedPages = filterPages(pages, q);
  if (q.length < MIN_QUERY) return NextResponse.json({ pages: matchedPages, records: [] });

  // ── Fiches ───────────────────────────────────────────────────────────────
  // On ne cherche que dans les collections que le menu montre : la recherche
  // ne doit pas ouvrir une porte que la nav tient fermée.
  const visible = new Set(pages.map((p) => p.href));
  const targets = SEARCHABLE.filter(
    (s) => visible.has(`${admin}/collections/${s.slug}`) && collections.has(s.slug),
  );

  const records = (
    await mapLimit(targets, 3, async (s): Promise<RecordHit[]> => {
      try {
        const res = await payload.find({
          collection: s.slug,
          where: whereFor(s, q),
          // `select` est typé par collection ; sur une union de slugs TS ne
          // sait pas le résoudre — les colonnes viennent de SEARCHABLE.
          select: selectFor(s) as never,
          user,
          overrideAccess: false,
          depth: 0,
          limit: 5,
          // Pas de COUNT : on n'affiche pas de total, inutile de le calculer.
          pagination: false,
        });
        const collectionLabel = labelOf(collections.get(s.slug)?.labels?.singular, s.slug);
        return (res.docs as Record<string, unknown>[]).map((d) => ({
          collection: s.slug,
          collectionLabel,
          id: d.id as number | string,
          label: s.label(d),
          sub: s.sub?.(d) || undefined,
          href: `${admin}/collections/${s.slug}/${d.id}`,
        }));
      } catch (err) {
        // Une collection en erreur ne doit pas vider toute la recherche —
        // mais on veut le savoir : une faute de champ se verrait ici.
        console.warn(`[search] ${s.slug} :`, err instanceof Error ? err.message : err);
        return [];
      }
    })
  ).flat();

  // ── Contacts → leur fiche cliente ────────────────────────────────────────
  // Une personne (nom, e-mail, téléphone) mène à l'opportunité qui la porte.
  // Même règle d'accès que les fiches : `overrideAccess: false`, le partenaire
  // ne trouve que les contacts de ses clients.
  if (visible.has(`${admin}/collections/partner-clients`)) {
    try {
      const res = await payload.find({
        collection: "client-contacts",
        where: contactsWhere(q),
        select: { client: true, firstName: true, lastName: true, email: true, phone: true } as never,
        user,
        overrideAccess: false,
        depth: 1,
        limit: 5,
        pagination: false,
      });
      const seen = new Set(records.filter((r) => r.collection === "partner-clients").map((r) => String(r.id)));
      for (const c of res.docs as { client?: { id?: number | string; companyName?: string } | number | string | null; firstName?: string; lastName?: string; email?: string; phone?: string }[]) {
        const client = c.client && typeof c.client === "object" ? c.client : null;
        const clientId = client?.id ?? (typeof c.client === "object" ? null : c.client);
        if (clientId == null || seen.has(String(clientId))) continue;
        seen.add(String(clientId));
        const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
        records.push({
          collection: "partner-clients",
          collectionLabel: "Contact",
          id: clientId,
          label: client?.companyName || person || "Opportunité",
          sub: [person, c.phone || c.email].filter(Boolean).join(" · ") || undefined,
          href: `${admin}/collections/partner-clients/${clientId}`,
        });
      }
    } catch (err) {
      console.warn("[search] client-contacts :", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ pages: matchedPages, records });
}
